# ⛔️ GUÍA ESTRICTA PARA AGENTES DE IA ⛔️

**INSTRUCCIÓN CRÍTICA PARA TODO AGENTE DE IA QUE TRABAJE EN ESTE PROYECTO:**

Estás trabajando en **Gardenia**, un motor visual de flujos de trabajo de alto rendimiento para ciencia de datos y bioinformática. Lee esta guía completa antes de hacer cualquier modificación.

---

## 1. ARCHIVOS PROTEGIDOS — NO MODIFICAR SIN PERMISO EXPLÍCITO

El motor central (`engine/core/`) ha sido fuertemente optimizado. Sus piezas están interconectadas de forma no obvia. **Modificar cualquiera de estos archivos sin entender la arquitectura completa puede romper silenciosamente el pipeline y causar crashes OOM (Out of Memory) al procesar datasets genómicos grandes.**

| Archivo | Rol | Por qué es crítico |
|---|---|---|
| `engine/core/dag_engine.py` | Ordena y ejecuta los nodos del grafo (topological sort via algoritmo de Kahn) | Controla el orden de ejecución, el paralelismo, el branching condicional y la cancelación de tareas |
| `engine/core/worker_manager.py` | Ejecuta el código de cada nodo (Python en thread/venv, R en subproceso) | Inyecta variables, captura salidas, detecta `yield` para modo streaming, maneja timeouts |
| `engine/core/variable_registry.py` | Almacén thread-safe de variables entre nodos | Gestiona los 3 scopes (global/workflow/node), resuelve referencias a Plasma y IPC disk |
| `engine/core/plasma_store.py` | Memoria compartida zero-copy vía Apache Arrow/Plasma | Los DataFrames entre nodos se pasan como punteros a `/dev/shm/`, sin copiar datos en RAM |
| `engine/core/stream_channel.py` | Canal de streaming basado en Arrow IPC | Coordina el flujo de chunks entre nodos productor y consumidor en tiempo real |
| `engine/orchestrator.py` | Servidor WebSocket que conecta el frontend React con el motor Python | Recibe el grafo desde el UI, lo convierte en `DAGNode`/`DAGEdge`, y emite eventos de estado |

---

## 2. CÓMO FUNCIONA EL MOTOR INTERNAMENTE

Entender esto es indispensable antes de proponer cualquier cambio.

### 2.1 Flujo de datos entre nodos (zero-copy)

Gardenia **no usa archivos intermedios** ni copia DataFrames en RAM. El flujo es:

```
Nodo A ejecuta código Python
    └─ Crea variable 'result' (pd.DataFrame)
    └─ worker_manager detecta la variable nueva
    └─ plasma_store.put('nodo_a_result', df) → serializa a Arrow, escribe en /dev/shm/
    └─ variable_registry.set('result', plasma_key='nodo_a_result')

Nodo B ejecuta código Python
    └─ variable_registry.inject_into_namespace(namespace)
    └─ Lee plasma_store.get_as_pandas('nodo_a_result') → deserializa de /dev/shm/ (zero-copy)
    └─ 'result' ya está disponible como variable global en el namespace de Nodo B
```

Esto significa que `result` en el Nodo B es el **mismo bloque de memoria** que escribió el Nodo A — sin copiar datos.

### 2.2 Variables disponibles en el código de un nodo

El `worker_manager.py` inyecta automáticamente estas variables antes de ejecutar tu código:

| Variable | Tipo | Contenido |
|---|---|---|
| `params` | `dict` | Todos los valores de los parámetros de la UI (`{'multiplier': 10, 'sep': ','}`) |
| `inputs` | `dict` | Todos los parámetros + todas las variables upstream (merge de ambos) |
| `<nombre>` | global | Cada parámetro y cada variable upstream inyectada directamente como variable global |
| `stream_input` | función | Iterador para consumir streams del nodo anterior (solo si hay streams upstream) |

Ejemplo de lo que recibe un nodo con input `gene_counts` y parámetro `threshold`:

```python
# Todas estas formas son equivalentes y funcionan:
df = gene_counts             # Variable global directa
df = inputs['gene_counts']   # Vía diccionario unificado

t  = threshold               # Parámetro como variable global
t  = params['threshold']     # Vía diccionario de parámetros
t  = inputs['threshold']     # También está en inputs
```

### 2.3 Cómo el motor detecta las salidas de un nodo

Al terminar la ejecución, `worker_manager.py` compara el namespace antes y después de ejecutar el código. **Cualquier variable nueva** (no existente antes de la ejecución) se extrae automáticamente:

```python
new_keys = set(namespace.keys()) - initial_keys
# Para cada nueva variable que sea DataFrame → se mueve a PlasmaStore
# Para el resto → se registra en VariableRegistry a scope WORKFLOW
```

Esto implica:
- **No necesitas `return`** — solo crea la variable con el nombre correcto.
- El nombre de la variable **debe coincidir** con el `name` en el array `outputs[]` del `ToolDefinition` para que el puerto UI quede conectado.
- Variables que ya existían antes de ejecutar el nodo **no son re-exportadas**.

### 2.4 Ejecución del DAG

`dag_engine.py` usa el **algoritmo de Kahn** para ordenar los nodos topológicamente. Soporta:

- **Ejecución secuencial** (por defecto): nodo por nodo en orden topológico.
- **Ejecución paralela** (modo streaming): todos los nodos se lanzan simultáneamente; los nodos consumidores se bloquean en `StreamChannel.read_batches()` hasta que el productor emita chunks.
- **Ejecución parcial**: `start_from=<node_id>` ejecuta solo ese nodo y sus descendientes, omitiendo los upstream (útil para re-ejecutar desde un punto).
- **Branching condicional**: si un nodo asigna `__branch_handle__`, el DAG solo activa los nodos en ese puerto de salida y marca los demás como `SKIPPED`.

---

## 3. REGLAS DE ORO PARA EL CÓDIGO DE LOS NODOS

### ✅ Correcto

```python
# Usar las variables inyectadas directamente
filtered = data[data['pvalue'] < params['threshold']]
result = filtered.reset_index(drop=True)
# 'result' es nueva → el motor la detecta y mueve a PlasmaStore automáticamente
```

```python
# Para parámetros opcionales, siempre usa .get() con valor por defecto
sep = params.get('sep', ',')
col = params.get('gene_col', 'gene_id')
```

```python
# Para variables con nombre dinámico (configurable por el usuario)
var_name = params.get('output_name', 'result')
globals()[var_name] = processed_df
# El nodo siguiente tendrá disponible la variable con ese nombre
```

### ❌ Incorrecto — Nunca hagas esto

```python
# ❌ Guardar a disco para pasar datos al siguiente nodo
result.to_csv('/tmp/intermediate.csv')
result.to_parquet('/tmp/temp.parquet')
# → Rompe el pipeline zero-copy. El siguiente nodo NO leerá ese archivo.

# ❌ Pickle para DataFrames grandes
import pickle
pickle.dump(result, open('/tmp/data.pkl', 'wb'))
# → Duplica el uso de RAM y es innecesario.

# ❌ Modificar la variable de entrada en lugar de crear una nueva
data['nueva_col'] = data['value'] * 2
result = data
# → Funciona, pero es confuso. Mejor crear una copia explícita primero.

# ❌ Intentar importar módulos del motor dentro del nodo
from engine.core import plasma_store  # No existe en el sandbox del nodo
```

---

## 4. STREAMING — CUÁNDO Y CÓMO USARLO

Usa `yield` cuando el dataset no cabe entero en RAM o cuando quieres que el nodo siguiente empiece a procesar antes de que el actual termine.

El motor detecta `yield` automáticamente y cambia el modo de ejecución a streaming. La conexión visual en el UI se anima con el indicador ⚡.

### Nodo Productor

```python
import pandas as pd

chunk_size = 10_000

for i in range(0, len(source_data), chunk_size):
    chunk = source_data.iloc[i:i + chunk_size].copy()
    chunk['normalized'] = (chunk['value'] - chunk['value'].mean()) / chunk['value'].std()
    yield chunk  # → serializado como Arrow RecordBatch y enviado al StreamChannel
```

### Nodo Consumidor

```python
# stream_input() es inyectado por el motor — NO lo importes ni lo definas
# Pásale el nombre de la variable upstream que quieres consumir
stream = stream_input('chunk')

total_rows = 0
for chunk in stream:
    # Procesa solo este chunk — el anterior ya fue liberado de RAM
    total_rows += len(chunk)
    chunk['log_value'] = chunk['value'].apply(lambda x: max(0, x))
    yield chunk  # Re-transmite al siguiente nodo en la cadena
```

> ⚠️ Los nodos R **no soportan** `yield` ni streaming. Solo pueden consumir y producir `data.frame`s completos.

---

## 5. CREANDO NUEVOS NODOS

Cuando el usuario pide crear un nodo nuevo, el proceso completo es:

**Paso 1: Crear el archivo TypeScript** en `gardeniaclient/src/registry/definitions/MiNodo.ts`

El archivo es descubierto automáticamente por Vite — no hay que registrarlo en ningún otro lugar.

```typescript
import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('mi-nodo', 'Mi Nodo')
    .setCategory('Data Wrangling')
    .setDescription('Filtra filas con valores por encima de un umbral.')
    .addInput('data', 'dataset', 'DataFrame de entrada')
    .addOutput('result', 'dataset', 'DataFrame filtrado')
    .addSlider('threshold', 'Umbral', 0, 100, 50, 1, 'Valor mínimo para conservar la fila')
    .addString('column', 'Columna', 'value', 'Columna numérica a filtrar')
    .setPythonCode(`
col = params.get('column', 'value')
threshold = params.get('threshold', 50)

if col not in data.columns:
    raise ValueError(f"Columna '{col}' no encontrada en el dataset")

result = data[data[col] >= threshold].reset_index(drop=True)
print(f"Filas conservadas: {len(result)} de {len(data)}")
`, ['pandas'])
    .build();
```

**Paso 2: Escribir el código del nodo**

- El código va en el campo `defaultCode` (objeto literal) o como primer argumento de `.setPythonCode()` / `.setRCode()` (NodeBuilder).
- Usa las variables upstream directamente — están inyectadas como globales.
- La variable de salida debe tener el mismo nombre que el puerto definido en `addOutput()`.

Consulta `CREATING_NODES.md` para la referencia completa de tipos de parámetros, puertos y ejemplos avanzados.

---

## 6. UI — COMPONENTES DE REACTFLOW

- Modificar archivos en `gardeniaclient/src/components/` **está permitido**.
- **No elimines ni modifiques** los tipos de arista (`EdgeTypes`). En particular, `StreamEdge` implementa la animación visual del streaming (⚡) — es crítico para el feedback al usuario.
- Si defines un nuevo tipo de nodo visual en ReactFlow, su `type` debe coincidir **exactamente** con el `id` del `ToolDefinition`:

```typescript
// En MiNodo.ts:
new NodeBuilder('mi-nodo', 'Mi Nodo')   // id = 'mi-nodo'

// En App.tsx (o donde se registren nodeTypes):
nodeTypes['mi-nodo'] = MiNodoComponent  // debe coincidir
```

- Los nodos `flow-start` y `flow-end` son especiales — el `dag_engine.py` los reconoce explícitamente por `tool_id` y los salta sin ejecutar código. No los renombres.

---

> **⚠️ Violar las reglas de las secciones 1–3 romperá el pipeline de zero-copy y puede causar crashes OOM al procesar datasets genómicos de millones de filas.**
