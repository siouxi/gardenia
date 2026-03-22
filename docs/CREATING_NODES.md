# 🛠️ Creando Nodos en Gardenia: La Guía Completa

Gardenia es un motor visual de flujos de trabajo de alto rendimiento, diseñado para procesar datasets masivos (como Single-Cell RNA-seq o CSVs enormes) de forma nativa, sin duplicar datos en memoria.

Esta guía explica en detalle cómo crear nuevos nodos, cómo configurar sus entradas y salidas, y cómo los datos se mueven de forma segura y eficiente entre ellos usando Arrow y Plasma Store.

---

## 🏗️ Estructura de una Definición de Nodo

En Gardenia, los nodos se definen como objetos `ToolDefinition` en TypeScript, ubicados dentro de `gardeniaclient/src/registry/definitions/`.

Cada archivo `.ts` que coloques en esa carpeta es **descubierto automáticamente** en tiempo de compilación por Vite usando `import.meta.glob`. No necesitas registrar el nodo en ningún otro lugar — simplemente suelta el archivo en la carpeta y ya estará disponible en el sidebar.

Hay **dos formas equivalentes** de definir un nodo:

---

### Método 1: Objeto Literal (ToolDefinition)

Ideal para nodos con mucho código inline o estructuras complejas.

```typescript
import { ToolDefinition } from '../../types/ToolDefinition';

const tool: ToolDefinition = {
    id: 'mi-nodo',              // Identificador único (usado internamente por el motor)
    name: 'Mi Nodo',            // Nombre visible en el sidebar
    description: 'Lo que hace este nodo.',
    category: 'Data Wrangling', // Ver lista completa de categorías más abajo
    version: '1.0.0',
    language: 'python',         // 'python' | 'r'
    hidden: false,              // Si es true, NO aparece en el sidebar (nodos internos)
    author: 'Tu Nombre',        // Opcional

    // Puertos de conexión visual
    inputs: [
        { name: 'data', type: 'dataset', description: 'Tabla de entrada' }
    ],
    outputs: [
        { name: 'result', type: 'dataset', description: 'Tabla de salida' }
    ],

    // Controles UI que aparecen en el panel lateral del nodo
    parameters: [
        {
            name: 'multiplier',   // Nombre de la variable inyectada en el código
            type: 'number',
            label: 'Multiplicador',
            default: 10,
            required: true
        }
    ],

    // Librerías a instalar en el venv aislado del nodo
    libraries: ['pandas', 'numpy'],

    // El código funcional que ejecuta el motor
    defaultCode: `
result = data * params['multiplier']
`,
};

export default tool;
```

---

### Método 2: NodeBuilder API Fluent (Recomendado)

Ideal para la mayoría de los nodos. La clase `NodeBuilder` ofrece una API encadenada y legible que elimina el boilerplate repetitivo.

```typescript
import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('mi-nodo', 'Mi Nodo')
    .setDescription('Lo que hace este nodo.')
    .setCategory('Data Wrangling')
    .setVersion('1.0.0')
    .setAuthor('Tu Nombre')
    // Puertos
    .addInput('data', 'dataset', 'Tabla de entrada')
    .addOutput('result', 'dataset', 'Tabla de salida')
    // Parámetros
    .addSlider('multiplier', 'Multiplicador', 1, 100, 10, 1, 'Multiplica los datos')
    .addToggle('filter_negativos', 'Filtrar Negativos', false, 'Elimina valores negativos')
    // Código + librerías
    .setPythonCode(`
result = data * params['multiplier']
if params['filter_negativos']:
    result = result[result >= 0]
`, ['pandas', 'numpy'])
    .build();
```

> 💡 Ambos métodos producen exactamente el mismo objeto `ToolDefinition`. El `NodeBuilder` simplemente lo construye pieza por pieza con un API más cómoda.

---

## 📂 Categorías (`ToolCategory`)

El campo `category` debe ser **exactamente** uno de los siguientes valores de cadena. El sidebar del UI los muestra en este orden:

| Categoría | Descripción |
|---|---|
| `'Input/Output'` | Nodos para cargar archivos (CSV, Parquet, Excel, FASTA) y exportar resultados |
| `'Data Wrangling'` | Filtrado de filas, selección de columnas, reshape, merges y operaciones de conjuntos |
| `'Quality Control'` | Verificación de calidad, valores faltantes, duplicados |
| `'Normalization'` | Métodos de normalización (cuantil, z-score, DESeq2 norm) |
| `'Statistical Analysis'` | Tests estadísticos, correlaciones, ANOVA, T-test |
| `'Differential Expression'` | Herramientas DE — DESeq2, EdgeR, Limma-Voom |
| `'Machine Learning'` | Entrenamiento de modelos, clustering K-means, PCA |
| `'Sequence Analysis'` | BLAST, alineamiento, traducción de secuencias, árboles filogenéticos |
| `'Visualization'` | Gráficos — BarPlot, Heatmap, Volcano Plot, GGPlot, PCA Biplot |
| `'Utilities'` | Control de flujo — Condicionales, ForEach, Variables, PostIt |

---

## 🔌 Tipos de Puerto (`ToolIO`)

Cada entrada u salida tiene un `name`, un `type` y una `description` opcional.

El `type` es una cadena libre que Gardenia usa para **colorear las conexiones visualmente** y validar compatibilidad entre nodos.

| Tipo | Descripción | Ejemplo de uso |
|---|---|---|
| `'dataset'` | DataFrame de Pandas / Arrow Table | La mayoría de nodos |
| `'signal'` | Puerto de disparo — no pasa datos, solo activa la ejecución | CSV Input, Excel Input |
| `'fasta'` | Handle de archivo FASTA | FASTAInput, BLAST |
| `'bam'`, `'fastq'`, `'gff'` | Tipos de archivos bioinformáticos | Nodos de Sequence Analysis |
| Cualquier string | Tipos personalizados — solo afectan el color visual | Nodos custom |

### ¿Cuándo usar `signal`?

Úsalo cuando un nodo debe poder ejecutarse sin recibir datos de otro nodo (p.ej., un lector de archivos que solo necesita una ruta como parámetro). El puerto `signal` permite que alguien lo "detone" desde un nodo `Start` sin pasarle datos reales.

```typescript
// El CSV Input usa signal para que funcione sin conexiones de datos upstream
inputs: [
    { name: 'trigger', type: 'signal', description: 'Activa la carga del archivo' }
]
```

---

## 🎛️ Tipos de Parámetro (`ToolParameter`)

Los parámetros controlan la UI que aparece en el panel lateral del nodo cuando el usuario lo selecciona. El nombre del parámetro se convierte en una variable global dentro del código del nodo.

| Tipo | Método en NodeBuilder | Descripción | Cuándo usarlo |
|---|---|---|---|
| `'string'` | `.addString(name, label, default, desc)` | Input de texto de una línea | Nombres de columnas, separadores, expresiones |
| `'text'` | *(solo objeto literal)* | Área de texto multilínea | Queries largas, scripts inline |
| `'number'` | `.addNumber(name, label, default, desc)` | Input numérico | Umbrales, cantidades, iteraciones |
| `'boolean'` | `.addBoolean(name, label, default, desc)` | Checkbox | Opciones on/off simples |
| `'toggle'` | `.addToggle(name, label, default, desc)` | Interruptor visual | Similar a boolean pero con mejor UX |
| `'slider'` | `.addSlider(name, label, min, max, default, step, desc)` | Slider con rango numérico | Percentiles, n_neighbors, tamaños de chunk |
| `'select'` | `.addSelect(name, label, opciones[], default, desc)` | Menú desplegable | Métodos o modos con opciones fijas |
| `'file'` | `.addFile(name, label, desc)` | Selector de archivo (abrir) | Rutas de archivos de entrada |
| `'save-file'` | `.addSaveFile(name, label, desc)` | Selector de archivo (guardar) | Rutas de archivos de salida |

### Ejemplos de cada tipo

```typescript
// String — para el nombre de una columna
.addString('gene_col', 'Columna de Gen', 'gene_id', 'Nombre de la columna con IDs de genes')

// Number — para un umbral
.addNumber('pvalue_threshold', 'Umbral de p-value', 0.05)

// Toggle — para una opción on/off
.addToggle('remove_duplicates', 'Eliminar Duplicados', true)

// Slider — para n_neighbors en un análisis UMAP
.addSlider('n_neighbors', 'N Vecinos', 5, 100, 15, 1, 'Vecinos para el cálculo UMAP')

// Select — para el método de normalización
.addSelect('method', 'Método', ['log1p', 'cpm', 'tpm'], 'log1p')

// File — para cargar un archivo de referencia
.addFile('ref_genome', 'Genoma de Referencia', 'Archivo FASTA de referencia')

// Save-file — para elegir dónde guardar el resultado
.addSaveFile('output_path', 'Guardar como...', 'Ruta del archivo de salida')
```

---

## 📦 Campo `libraries`

Declara las librerías de Python o R que necesita el código del nodo. El `venv_manager` de Gardenia las instala automáticamente en un entorno virtual aislado antes de ejecutar el nodo por primera vez.

```typescript
// En un objeto literal
libraries: ['pandas', 'numpy', 'scikit-learn', 'statsmodels']

// Con NodeBuilder — las librerías van como segundo argumento
.setPythonCode(codigo, ['pandas', 'scipy'])
.setRCode(codigoR, ['ggplot2', 'dplyr', 'DESeq2'])
```

> 💡 No necesitas declarar `pandas` ni `numpy` si ya están en el entorno base — pero es buena práctica hacerlo igualmente para que la documentación del nodo sea explícita.

---

## 📥 Recibiendo Entradas

A diferencia de la programación tradicional donde pasas argumentos a funciones, **Gardenia inyecta los datos directamente en el entorno global del nodo**. No necesitas llamar a `read_csv()` ni `read_parquet()` para mover datos entre nodos.

### 1. Parámetros del Nodo (UI)

Cuando defines un parámetro (p.ej., `multiplier`), el motor lo inyecta de dos formas dentro de Python:

1. **Como variable global** con el mismo nombre: `multiplier`
2. **Dentro del diccionario `params`**: `params['multiplier']`

```python
# Ambas formas de acceder al mismo parámetro — elige la que prefieras
print(multiplier)           # Variable global directa
print(params['multiplier']) # Vía diccionario

# Usa .get() para parámetros opcionales con valor por defecto
sep = params.get('sep', ',')
```

En **R**, los parámetros se inyectan solo como variables globales:

```r
# 'multiplier' ya está disponible como variable global en R
result <- data
result$value <- result$value * multiplier
```

### 2. Datos del Nodo Anterior (Aristas/Conexiones)

Si el nodo anterior exporta una tabla llamada `processed_data`, al conectarlo al tuyo, **`processed_data` queda disponible instantáneamente como variable global** en tu código, sin copiar datos.

El `worker_manager.py` se encarga de mapear el segmento de memoria compartida de Apache Plasma a ese nombre de variable.

```python
# Escenario: el nodo anterior exportó 'gene_counts'
# En tu nodo, está disponible directamente:
normalized = gene_counts / gene_counts.sum() * 1_000_000
result = normalized
```

### 3. Los Diccionarios `inputs` y `params`

Por conveniencia, los nodos Python también reciben dos diccionarios:

- **`params`** — todos los valores de la UI (parámetros configurados por el usuario)
- **`inputs`** — todas las variables de datasets upstream unidas con los params

```python
# Estas tres formas son equivalentes para acceder a datos upstream:
df = gene_counts           # Variable global inyectada directamente
df = inputs['gene_counts'] # Vía diccionario inputs

# Para parámetros:
threshold = params['pvalue_threshold']
method = inputs['method']  # inputs también incluye params
```

Usar `inputs['nombre']` es útil cuando el nombre de la variable upstream viene de un parámetro de configuración y no lo conoces con antelación.

### 4. Nombres de Variable Dinámicos

Si un parámetro controla el nombre de la variable de salida (como hace el nodo CSV Input con `variable_name`), usa `globals()` para asignarla dinámicamente:

```python
# El usuario configuró 'variable_name' = 'mis_genes'
var_name = params.get('variable_name', 'data')

# Asignamos el DataFrame con el nombre que eligió el usuario
globals()[var_name] = pd.read_csv(path)

# Ahora el siguiente nodo tendrá disponible 'mis_genes' en su entorno
```

---

## 📤 Enviando Salidas

**Cualquier variable nueva creada en el scope global de tu nodo es extraída automáticamente** por el `VariableRegistry` del motor cuando el nodo termina de ejecutarse.

```python
# El motor detecta que 'result' es nuevo — lo mueve a Plasma Store y lo expone como puerto
result = data.groupby('condition')['expression'].mean()
```

El motor detecta que `result` es un DataFrame o Arrow Table, lo serializa a Arrow, lo almacena en Plasma (memoria compartida), y lo expone como puerto de salida para el nodo siguiente — **sin copiar los datos en RAM**.

### Reglas importantes de salida

```python
# ✅ CORRECTO: asignar una variable nueva con el nombre del puerto de salida
result = data.dropna()

# ✅ CORRECTO: el nombre de la variable debe coincidir con el 'name' en outputs[]
filtered_genes = data[data['pvalue'] < 0.05]
# → outputs: [{ name: 'filtered_genes', type: 'dataset' }]

# ❌ MAL: guardar a disco para pasarle datos al siguiente nodo
result.to_csv('/tmp/result.csv')       # Rompe el pipeline zero-copy
result.to_parquet('/tmp/result.parquet')

# ❌ MAL: modificar la variable de entrada en lugar de crear una nueva
data['new_col'] = data['value'] * 2    # 'data' ya existía — podría no ser detectado como nueva salida
```

---

## ⚡ Nodos Streaming (Chunk a Chunk)

Cuando procesas archivos más grandes que tu RAM (p.ej., un FASTQ de 50GB o un CSV masivo de millones de filas), la memoria compartida zero-copy estándar no es suficiente porque el archivo completo no cabe en memoria. Gardenia soluciona esto con **Generadores** y **Arrow StreamChannels**.

### Cómo funciona el Streaming

1. El motor detecta que tu código contiene `yield` y crea automáticamente un **`StreamChannel`** — un pipe basado en Arrow IPC Streaming.
2. Cada vez que el nodo productor hace `yield chunk`, el chunk se serializa como un `RecordBatch` de Arrow y se envía al pipe.
3. Los nodos consumidores downstream **comienzan a ejecutarse de inmediato**, jalando chunks del pipe conforme llegan — sin esperar a que el productor termine.
4. El uso total de RAM queda limitado al tamaño de los chunks en tránsito (p.ej., 10,000 filas a la vez).

La conexión entre nodos cambia visualmente a **Modo Streaming animado (⚡)** de forma automática.

### Creando una Salida en Streaming (Productor)

Usa `yield` en lugar de asignar todo a una variable final:

```python
import pandas as pd
import numpy as np

chunk_size = 10_000
total_rows = 1_000_000

for i in range(0, total_rows, chunk_size):
    # Generamos o leemos solo este chunk
    chunk = pd.DataFrame({
        'id': range(i, i + chunk_size),
        'expression': np.random.rand(chunk_size),
        'pvalue': np.random.uniform(0, 1, chunk_size)
    })

    # El motor intercepta este yield y lo empuja al StreamChannel
    yield chunk

# No hay 'result = ...' al final — el streaming replace la salida estática
```

### Consumiendo un Stream (Consumidor)

Los nodos downstream consumen el stream con la función inyectada `stream_input()`, que actúa como un iterador estándar:

```python
# stream_input() es inyectado automáticamente. Pásale el nombre de la variable upstream.
stream = stream_input('chunk')

resultados = []

for chunk in stream:
    # Procesamos solo este chunk en memoria
    chunk_filtrado = chunk[chunk['pvalue'] < 0.05]
    resultados.append(chunk_filtrado)

    # Opcional: re-emitir el chunk al siguiente nodo (pipeline de 3+ nodos)
    yield chunk_filtrado

# O: acumular todo y emitir al final (si cabe en memoria)
# result = pd.concat(resultados, ignore_index=True)
```

> 💡 Puedes encadenar nodos streaming: Productor → Filtro → Normalizador, todos ejecutándose en paralelo con chunks circulando entre ellos.

---

## 🔀 Enrutamiento Condicional (Branching)

A veces un nodo necesita decidir qué camino downstream activar — por ejemplo: si los datos son válidos → Nodo A; si están vacíos → Nodo B.

Para esto, asigna un valor a la variable global especial `__branch_handle__`.

### Definición TypeScript

```typescript
// Define dos salidas que serán las dos ramas posibles
export default new NodeBuilder('mi-validador', 'Validador')
    .addInput('data', 'dataset')
    .addOutput('datos_validos', 'dataset', 'Datos que pasaron la validación')
    .addOutput('log_errores', 'dataset',  'Registro de errores si falló')
    .addNumber('min_rows', 'Filas mínimas requeridas', 100)
    .setPythonCode(`
min_rows = params.get('min_rows', 100)

if len(data) >= min_rows:
    datos_validos = data
    __branch_handle__ = 'datos_validos'  # Solo los nodos en esta rama ejecutarán
else:
    import pandas as pd
    log_errores = pd.DataFrame([{
        'error': f'Dataset insuficiente: {len(data)} filas (mínimo {min_rows})',
        'timestamp': str(pd.Timestamp.now())
    }])
    __branch_handle__ = 'log_errores'    # Routea hacia la rama de error
`)
    .build();
```

> El nodo **Conditional** integrado en Gardenia implementa este patrón con una expresión Python evaluada dinámicamente (`eval()`), enrutando entre `true_out` y `false_out` según el resultado.

---

## 📦 Nodos en R

La creación de nodos en R está completamente soportada. Los nodos R corren en un subproceso bridge persistente.

### Cómo funciona la comunicación Python ↔ R

- **Entradas**: Los DataFrames upstream son convertidos vía Arrow IPC y cargados en R como objetos `data.frame` nativos. Los parámetros de la UI se inyectan como variables globales de R.
- **Salidas**: Cualquier `data.frame` nuevo que asignes en R es serializado de vuelta a Arrow automáticamente y devuelto al orchestrador Python.
- **Librerías**: Declara los paquetes de R en el campo `libraries`.
- ⚠️ **Nota**: Los nodos R actualmente **no soportan** el patrón de streaming con `yield`. Consumen y producen `data.frame`s completos.

### Ejemplo con objeto literal

```typescript
const tool: ToolDefinition = {
    id: 'zscore-r',
    name: 'Z-Score (R)',
    category: 'Normalization',
    language: 'r',
    libraries: ['base'],
    inputs:  [{ name: 'data', type: 'dataset' }],
    outputs: [{ name: 'result', type: 'dataset' }],
    parameters: [
        { name: 'column', type: 'string', label: 'Columna a normalizar', default: 'expression' }
    ],
    defaultCode: `
# 'data' (data.frame) y 'column' (string) ya están inyectados como globales

col <- column  # parámetro inyectado
result <- data
result[[col]] <- scale(result[[col]])  # Z-score estándar

# 'result' es interceptado automáticamente y enviado al siguiente nodo
`,
};
```

### Ejemplo con NodeBuilder

```typescript
import { NodeBuilder } from '../NodeBuilder';

export default new NodeBuilder('zscore-r', 'Z-Score (R)')
    .setCategory('Normalization')
    .setDescription('Normalización Z-Score usando R base')
    .addInput('data', 'dataset', 'DataFrame de entrada')
    .addOutput('result', 'dataset', 'DataFrame normalizado')
    .addString('column', 'Columna', 'expression', 'Columna numérica a normalizar')
    .setRCode(`
col <- column
result <- data
result[[col]] <- scale(result[[col]])
`, ['base'])
    .build();
```
