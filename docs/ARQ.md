# 🌿 Arquitectura de Gardenia

Gardenia es una aplicación de escritorio **Electron + React** en el frontend y un **motor Python** en el backend, diseñada para ejecutar flujos de trabajo visuales (grafos de nodos) sobre datasets científicos grandes de forma eficiente, sin duplicar datos en memoria (zero-copy).

---

## 🗺️ Vista General del Sistema

```
┌──────────────────────────────────────────────────────────────┐
│                    PROCESO ELECTRON (Node.js)                │
│                                                              │
│  ┌─────────────────┐    preload.ts     ┌──────────────────┐ │
│  │  Renderer (React)│ ◄──electronAPI──► │  Main Process    │ │
│  │  - UI / ReactFlow│                  │  - IPC Handlers  │ │
│  │  - Zustand Stores│                  │  - SettingsStore │ │
│  └─────────────────┘                  │  - ProjectManager│ │
│                                        │  - Sessions: R,  │ │
│                                        │    Python, Bash  │ │
│                                        └────────┬─────────┘ │
└─────────────────────────────────────────────────┼────────────┘
                                                  │ spawn
                                    ┌─────────────▼──────────────────┐
                                    │     PROCESO PYTHON             │
                                    │     engine/orchestrator.py     │
                                    │                                │
                                    │  HTTP POST /message   (1:1)    │
                                    │  WebSocket /ws        (eventos)│
                                    │  SSE       /events    (fallback)│
                                    │                                │
                                    │  ┌──────────────────────────┐  │
                                    │  │    DAG Engine (core/)    │  │
                                    │  │  dag_engine.py           │  │
                                    │  │  worker_manager.py       │  │
                                    │  │  variable_registry.py    │  │
                                    │  │  plasma_store.py         │  │
                                    │  │  stream_channel.py       │  │
                                    │  │  storage.py              │  │
                                    │  └──────────────────────────┘  │
                                    └────────────────────────────────┘
                                              │   (arrow IPC / /dev/shm)
                                    ┌─────────▼──────────────┐
                                    │  PROCESO R (r_bridge.R) │
                                    │  stdin/stdout JSON      │
                                    └────────────────────────┘
```

---

## 🏗️ Estructura de Archivos Completa

```
gardenia/
│
├── engine/                          ← Motor Python (backend de ejecución)
│   ├── orchestrator.py              ← Punto de entrada del motor Python
│   ├── requirements.txt
│   └── core/
│       ├── __init__.py
│       ├── dag_engine.py            ← Ordenamiento y ejecución del DAG
│       ├── worker_manager.py        ← Ejecuta código Python y R
│       ├── variable_registry.py     ← Almacén thread-safe de variables
│       ├── plasma_store.py          ← Memoria compartida zero-copy (Arrow/Plasma)
│       ├── stream_channel.py        ← Streaming chunk a chunk (generadores)
│       ├── storage.py               ← Persistencia de datasets en disco
│       ├── venv_manager.py          ← Gestión de venvs aislados por nodo
│       ├── ray_backend.py           ← Backend distribuido Ray (opcional)
│       └── errors.py                ← Clases de error estructuradas
│
├── gardeniaclient/                  ← Frontend (Electron + React + Vite)
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   │
│   ├── electron/                    ← Proceso principal de Electron (Node.js)
│   │   ├── main.ts                  ← Punto de entrada de Electron; IPC handlers
│   │   ├── preload.ts               ← Puente seguro Renderer ↔ Main (contextBridge)
│   │   ├── r_bridge.R               ← Script R persistente (protocolo JSON stdin/stdout)
│   │   ├── python_bridge.py         ← Session Python interactiva (Terminal)
│   │   ├── bash_bridge.py           ← Session Bash interactiva (Terminal)
│   │   ├── orchestrator/
│   │   │   ├── Orchestrator.ts      ← Cliente TypeScript del motor Python
│   │   │   ├── types.ts             ← Tipos: Workflow, ExecutionState, Variable, etc.
│   │   │   └── errors.ts            ← Tipos de error del orquestador
│   │   ├── project/
│   │   │   └── ProjectManager.ts    ← CRUD de proyectos (.leaf files)
│   │   └── utils/
│   │       └── envDetector.ts       ← Detección automática de Python/R en PATH
│   │
│   └── src/                         ← Renderer (React + TypeScript)
│       ├── main.tsx                 ← Punto de entrada React
│       ├── App.tsx                  ← Componente raíz; routing y canvas ReactFlow
│       ├── index.css
│       │
│       ├── registry/                ← Definiciones de todos los nodos
│       │   ├── NodeBuilder.ts       ← API fluent para crear nodos
│       │   ├── tools.ts             ← Auto-registro vía import.meta.glob
│       │   └── definitions/         ← Un archivo .ts por nodo
│       │       ├── CSVInput.ts
│       │       ├── DESeq2.ts
│       │       ├── ForEach.ts
│       │       └── ... (52 nodos)
│       │
│       ├── types/
│       │   ├── ToolDefinition.ts    ← Interfaz ToolDefinition, ToolParameter, ToolIO
│       │   └── r-types.ts           ← Tipos específicos de R
│       │
│       ├── stores/
│       │   ├── workflowStore.ts     ← Estado de ejecución (Zustand)
│       │   └── projectStore.ts      ← Estado del proyecto activo (Zustand)
│       │
│       ├── hooks/
│       │   └── useUndoRedo.ts       ← Historial de deshacer/rehacer del canvas
│       │
│       └── components/
│           ├── Inspector.tsx         ← Panel lateral: parámetros del nodo seleccionado
│           ├── NodesSidebar.tsx      ← Sidebar con la lista de nodos disponibles
│           ├── Sidebar.tsx           ← Contenedor del sidebar izquierdo
│           ├── StreamEdge.tsx        ← Arista animada para modo streaming (⚡)
│           ├── CodeEditor.tsx        ← Editor Monaco inline del código del nodo
│           ├── Terminal.tsx          ← Terminal integrada (Python/R/Bash)
│           ├── DataView.tsx          ← Vista tabular de datasets
│           ├── DataSidebar.tsx       ← Sidebar de datasets generados
│           ├── DatasetPreviewModal.tsx ← Modal de previsualización de datos
│           ├── VariableInspector.tsx ← Inspector de variables del workflow
│           ├── ReportView.tsx        ← Vista de reporte de ejecución
│           ├── ProjectManagerPage.tsx ← Pantalla de gestión de proyectos
│           ├── PackageManager.tsx    ← Gestor de paquetes Python/R
│           ├── EnginePreferences.tsx ← Preferencias del motor (Python/R paths)
│           ├── CustomMiniMap.tsx     ← Minimapa del canvas
│           ├── NodeContextMenu.tsx   ← Menú contextual de nodos
│           ├── PostItNode.tsx        ← Nodo PostIt (nota visual)
│           ├── ResolveNode.tsx       ← Nodo con lógica de resolución de conflictos
│           ├── ProgressBar.tsx       ← Barra de progreso de ejecución
│           ├── GardeniasLogo.tsx     ← Componente del logo
│           └── BioinformaticsIcons.tsx ← Iconos específicos de herramientas bio
│
└── docs/
    ├── ARQ.md                       ← Este archivo
    ├── CREATING_NODES.md            ← Guía para crear nodos
    └── AI_AGENT_GUIDELINES.md       ← Reglas para agentes de IA
```

---

## ⚙️ Flujo de Arranque de la Aplicación

```
1. Electron abre ProjectManagerPage (ventana de inicio)
2. Usuario selecciona o crea un proyecto (.leaf file)
3. main.ts llama openProjectAndLaunchMain():
   a. Lee el .leaf (JSON con nodos, aristas y metadatos)
   b. Crea la ventana principal y carga el canvas React
   c. Lanza el proceso Python: spawn('python3', ['orchestrator.py'])
   d. El Python imprime {type: "server_started", port: N} en stdout
   e. Electron lee el puerto y abre un WebSocket a ws://127.0.0.1:N/ws
   f. Python envía {type: "ready"} → Electron emite evento 'ready'
4. React renderiza el canvas con los nodos del proyecto
5. workflowStore.initWorkflowEventListeners() registra listeners de IPC
```

---

## 🔗 Capa de Comunicación Multi-Canal

Gardenia usa **tres canales simultáneos** entre el proceso Electron (Main) y el motor Python:

| Canal | Dirección | Protocolo | Uso |
|---|---|---|---|
| **HTTP POST `/message`** | Main → Python | JSON-RPC | Comandos síncronos: ejecutar, cancelar, obtener variables, preview de datasets |
| **WebSocket `/ws`** | Bidireccional | JSON eventos | Eventos en tiempo real: `state_change`, `output`, `node_variables`, `execution_complete` |
| **SSE `/events`** | Python → Main | `text/event-stream` | Fallback si WebSocket falla |

El puerto HTTP/WebSocket es **dinámico**: el motor Python lo elige como puerto libre del sistema operativo (`port=0`) y lo comunica a Electron a través de stdout al arrancar.

### Flujo de un mensaje típico (ejecutar workflow)

```
React UI                 Electron Main          Python orchestrator.py
   │                         │                         │
   │─ electronAPI.executeWorkflow(data) ──────►         │
   │                 ipcRenderer.invoke('workflow:execute')
   │                         │                         │
   │                 HTTP POST /message                │
   │                 {type: "execute", payload: ...} ──►│
   │                         │          orchestrator.handle_message()
   │                         │          dag_engine.execute()
   │                         │                ↓ (nodo por nodo)
   │                         │◄── WS: {type: "state_change", node_id, state: "running"}
   │◄─workflow:node-state──── │                         │
   │                         │◄── WS: {type: "output", node_id, output: "..."}
   │◄─workflow:node-output─── │                         │
   │                         │◄── WS: {type: "execution_complete", status: "success"}
   │◄─workflow:complete─────── │                         │
   │                         │◄── HTTP response: {status: "success", ...}
```

---

## 🔌 Puente Renderer ↔ Main (preload.ts / contextBridge)

`preload.ts` expone el objeto `window.electronAPI` al Renderer usando `contextBridge.exposeInMainWorld`. Esto es la única forma en que React puede invocar código de Node.js, manteniendo el aislamiento de contexto de Electron.

Las funciones expuestas se dividen en grupos:

| Grupo | Ejemplos |
|---|---|
| **Workflow** | `executeWorkflow`, `executeWorkflowFrom`, `executeWorkflowOnly`, `cancelWorkflow`, `forceStopWorkflow` |
| **Variables/Datos** | `getWorkflowVariables`, `previewDataset`, `getWorkflowDatasets` |
| **Eventos** (listeners) | `onNodeStateChange`, `onNodeOutput`, `onWorkflowComplete`, `onExecutionOrder` |
| **Proyectos** | `createProject`, `openProject`, `saveProject`, `closeProject`, `renameProject` |
| **Carpetas** | `createFolder`, `addProjectToFolder`, `removeProjectFromFolder` |
| **Sesiones** | `startRSession`, `executeRCommand`, `startPythonSession`, `executeBashCommand` |
| **Paquetes** | `installPythonPackage`, `installRPackage`, `listCondaEnvs` |
| **Archivos** | `openFileDialog`, `saveFileDialog` |

---

## 📁 Sistema de Proyectos

Los proyectos se guardan como archivos `.leaf` (JSON renombrado). El `ProjectManager.ts` los gestiona:

- **Ubicación por defecto**: `~/.config/Gardenia/projects/` (Linux) / `userData/projects/`
- **Índice de proyectos**: `userData/projects-index.json` — lista de todos los proyectos con metadatos y carpetas
- **Carpetas**: Se pueden agrupar proyectos en carpetas lógicas (drag & drop en el UI)

Un `.leaf` contiene:
```json
{
  "meta": { "name": "Mi Workflow", "createdAt": "...", "modifiedAt": "..." },
  "workflow": {
    "nodes": [...],   // Array de nodos ReactFlow con toolId, code, parameterValues
    "edges": [...]    // Conexiones entre nodos
  }
}
```

---

## 🐍 Motor Python — Descripción de cada módulo

### `engine/orchestrator.py` — Punto de entrada

Lanza un servidor HTTP/WebSocket con `aiohttp`. Es el único punto de contacto con Electron.

- Recibe mensajes JSON (tipo `execute`, `cancel`, `get_variables`, `preview_dataset`, etc.)
- Construye `DAGNode` y `DAGEdge` a partir del JSON del workflow
- Delega la ejecución a `dag_engine.py`
- Auto-guarda DataFrames resultantes en `storage.py`
- Detecta `__branch_handle__` en el registro de variables para el routing condicional
- **Puerto dinámico**: lo anota en stdout como `{type: "server_started", port: N}`

---

### `engine/core/dag_engine.py` — Orquestador del Grafo

Implementa el algoritmo de **Kahn** para ordenamiento topológico y la ejecución del DAG.

**Modos de ejecución:**

| Modo | Cuándo | Comportamiento |
|---|---|---|
| **Secuencial** | Sin `yield` en ningún nodo | Nodos en orden topológico, uno por uno |
| **Paralelo (streaming)** | Algún nodo usa `yield` | Todos los nodos se lanzan simultáneamente; los consumidores se bloquean en `StreamChannel` |
| **Parcial (`start_from`)** | Re-ejecución desde un nodo | Salta nodos upstream; solo ejecuta ese nodo y sus descendientes |
| **Aislado (`only_node`)** | Re-ejecución de un solo nodo | Solo ejecuta ese nodo usando datos cacheados del registro |
| **Ray (distribuido)** | `--backend ray` | Delega ejecución a `ray_backend.py` para cómputo distribuido |

**Manejo de branching:** Si un nodo asigna `__branch_handle__`, el motor identifica los sucesores que corresponden a ese puerto y marca el resto como `SKIPPED`.

**Estados de un nodo:**
`PENDING` → `QUEUED` → `RUNNING` → `SUCCESS` / `ERROR` / `TIMEOUT` / `CANCELLED` / `SKIPPED` / `STREAMING`

---

### `engine/core/worker_manager.py` — Ejecutor de Código

Recibe el código de un nodo y lo ejecuta en el contexto correcto.

**Lógica de decisión:**

```
¿El nodo tiene `dependencies` (libraries)?      → _execute_in_venv (subprocess aislado)
¿El código contiene `yield`?                    → _execute_streaming (modo generador)
¿Lenguaje Python?                               → PythonWorker.execute() (exec() en thread)
¿Lenguaje R?                                   → RWorkerBridge.execute() (IPC JSON con proceso R)
```

**Inyección de variables en Python:**

Antes de ejecutar el código, el worker construye un `namespace` (dict) con:
- `params` → dict con todos los parámetros de la UI
- `inputs` → merge de `params` + todas las variables upstream del `VariableRegistry`
- Variables globales directas (cada parámetro y cada variable upstream como clave individual)
- `stream_input` → función helper para consumir streams upstream

**Extracción de variables de salida:**

Tras la ejecución, compara claves del namespace `antes` vs `después`. Las variables nuevas se registran en el `VariableRegistry`. Si son DataFrames, se mueven a `PlasmaStore`.

---

### `engine/core/variable_registry.py` — Almacén de Variables

Almacén **thread-safe** (`threading.RLock`) con tres niveles de scope:

```
GLOBAL   → persiste entre workflows (no se borra entre ejecuciones)
WORKFLOW → persiste durante un workflow (se borra entre runs completos)
NODE     → local a un nodo (uso interno, generalmente no accedido cross-node)
```

Búsqueda en cascada: NODE → WORKFLOW → GLOBAL.

Cada `Variable` almacena:
- `value` — valor en memoria (puede ser `None` si está en Plasma)
- `plasma_key` — clave en PlasmaStore (referencia a `/dev/shm/`)
- `ipc_path` — ruta a archivo Arrow en disco (fallback, principalmente para outputs R)
- `is_dataframe` — flag para DataFrames
- `preview` — representación string del shape para el UI

**Resolución con lazy-loading:** `inject_into_namespace()` resuelve variables en este orden de prioridad:
1. PlasmaStore (memoria compartida, zero-copy)
2. IPC path en disco (fallback)
3. Valor en memoria directa

---

### `engine/core/plasma_store.py` — Memoria Compartida Zero-Copy

Gestiona segmentos de memoria compartida en `/dev/shm/` usando Arrow IPC.

Un DataFrame se guarda como un archivo Arrow en `/dev/shm/` (RAM virtual):

```
proceso Python (Nodo A)        /dev/shm/gardenia_nodo_a_result.arrow        proceso Python (Nodo B)
         │                                       │                                    │
   plasma.put('nodo_a_result', df)               │                                    │
   → serializa a Arrow                           │                                    │
   → escribe en /dev/shm/  ────────────────►    [shm]  ◄────── plasma.get_as_pandas() │
                                                                       (deserializa)
```

Los dos procesos **comparten el mismo bloque de RAM** — no se transfieren datos por red ni por pipes. Compatible con nodos R (que pueden leer directamente con `arrow::read_ipc_file(path)`).

---

### `engine/core/stream_channel.py` — Streaming Chunk a Chunk

Implementa el pipeline de streaming basado en **Arrow IPC Streaming**.

Cuando un nodo usa `yield`:

1. `worker_manager._execute_streaming()` envuelve el código en una función generadora
2. Se crea un `StreamChannel` para ese nodo (identificado por `node_id + var_name`)
3. Cada chunk (`pd.DataFrame`) se serializa como Arrow `RecordBatch` y se empuja al canal
4. Los nodos consumidores suscritos al canal van consumiendo chunks conforme llegan via `stream_input()`
5. El productor y los consumidores corren **en paralelo** (por eso el DAG activa modo `parallel=True`)

Esto permite procesar archivos de decenas de GB con uso constante de RAM.

---

### `engine/core/storage.py` — Persistencia de Datasets

`ArrowStorage` guarda los DataFrames resultantes en disco (en formato Arrow/Parquet) entre ejecuciones. Se almacenan en `userData/data/` y se indexan con metadatos (nombre, shape, columnas, nodo fuente, timestamps).

Permite:
- Listar datasets disponibles (`list_datasets`)
- Previsualizar datos con estadísticas (`preview`)
- Limpiar el almacenamiento entre proyectos

---

### `engine/core/venv_manager.py` — Entornos Virtuales Aislados

Si un nodo declara `libraries: ['pandas', 'scipy']`, el `WorkerManager` detecta esto y en lugar de ejecutar el código en el proceso principal, lo corre en un subproceso con su propio `venv`.

`venv_manager.py` gestiona:
- Creación del venv si no existe
- Instalación de paquetes con `pip`
- Caché de venvs por conjunto de dependencias (para no reinstalar en cada ejecución)

---

### `engine/core/errors.py` — Errores Estructurados

`GardeniaError` es la clase de error base con campos:
- `category` (RUNTIME, IMPORT, SYNTAX, TIMEOUT, MEMORY, etc.)
- `message` — mensaje de error legible
- `traceback` — stack trace completo
- `language` — `'python'` o `'r'`
- `recoverable` — si el error es recuperable sin reiniciar el motor

Funciones `parse_python_error()` y `parse_r_error()` convierten excepciones crudas en `GardeniaError`.

---

## 🔴 El Bridge de R (`r_bridge.R`)

R no tiene un módulo de multiprocessing nativo compatible con Gardenia. La solución es un subproceso R persistente que se comunica con el motor Python via **JSON en stdin/stdout**.

**Protocolo:**
```
Python → R (stdin):  {"id": "node_123", "code": "...", "input_ipcs": [...], "output_dir": "..."}
R → Python (stdout): {"id": "node_123", "status": "success", "output": "...", "variables": [...]}
```

**Flujo interno del bridge:**
1. Lee el JSON de stdin línea a línea
2. Carga los DataFrames upstream desde archivos Arrow IPC (`/dev/shm/` o disco)
3. Ejecuta el código R en un entorno aislado con `eval(parse(text=code))`
4. Serializa los `data.frame` nuevos a Arrow IPC en `/dev/shm/`
5. Devuelve las rutas IPC en la respuesta JSON
6. Python ingiere esos archivos en el `PlasmaStore` y elimina los temporales

---

## ⚛️ Frontend React — Stores y Componentes Clave

### `workflowStore.ts` (Zustand)

Estado de ejecución en tiempo real. Se actualiza via los event listeners del IPC:

| Campo | Tipo | Descripción |
|---|---|---|
| `status` | `WorkflowStatus` | Estado global: `idle`, `running`, `completed`, `error`, `cancelled` |
| `nodeStates` | `Map<id, NodeExecutionState>` | Estado individual de cada nodo |
| `executionOrder` | `string[]` | Orden en que se ejecutarán los nodos (emitido por el DAG) |
| `variables` | `Variable[]` | Variables actuales del VariableRegistry |
| `datasets` | `Dataset[]` | Datasets guardados en storage |
| `isOrchestratorReady` | `boolean` | Si el proceso Python está listo |

### `App.tsx`

Componente raíz que monta el canvas de **ReactFlow**. Contiene:
- Los `nodeTypes` registrados (un componente React por `tool_id`)
- Los `edgeTypes` (incluyendo `StreamEdge` para las aristas animadas ⚡)
- El routing de ventanas (`/` = canvas, `/#/projects` = project manager)
- El manejo del estado de los nodos en el canvas (posición, conexiones, parámetros seleccionados)

### `Inspector.tsx`

Panel lateral derecho que se muestra al seleccionar un nodo. Renderiza dinámicamente los controles de cada parámetro (`ToolParameter`) según su tipo (`slider`, `select`, `toggle`, etc.) y los envía al `parameterValues` del nodo en tiempo real.

### `StreamEdge.tsx`

Arista especial de ReactFlow con animación CSS de partículas que fluyen de izquierda a derecha. Se activa cuando el nodo upstream entra en estado `streaming`. Proporciona feedback visual de que datos están siendo transmitidos en tiempo real.

### `Terminal.tsx`

Terminal interactiva integrada con tres modos:
- **Python**: sesión REPL persistente vía `python_bridge.py`
- **R**: sesión REPL persistente vía `r_bridge.R`
- **Bash**: sesión shell persistente vía `bash_bridge.py`

Cada modo usa sesiones independientes que persisten mientras la aplicación está abierta, permitiendo mantener estado entre comandos.

---

## 🔄 Ciclo Completo de Ejecución de un Workflow

```
1. Usuario hace clic en "Run" en el canvas React
   └─► App.tsx llama window.electronAPI.executeWorkflow({nodes, edges})

2. preload.ts reenvía via ipcRenderer.invoke('workflow:execute', ...)

3. main.ts maneja 'workflow:execute' → orchestrator.execute(workflowData)

4. Orchestrator.ts serializa el workflow y hace HTTP POST a /message
   {type: "execute", payload: {nodes: [...], edges: [...]}}

5. orchestrator.py recibe la petición → handle_message() → execute_workflow()
   a. Limpia el VariableRegistry (scope WORKFLOW)
   b. Parsea nodos y aristas en DAGNode[] y DAGEdge[]
   c. Detecta si algún nodo usa yield → activa modo paralelo
   d. Crea DAGExecutor y envía el orden de ejecución via WebSocket

6. DAGExecutor.execute() itera los nodos:
   Para cada nodo (en orden topológico o en paralelo si streaming):
   a. Emite state_change "running" → Electron → React actualiza color del nodo
   b. WorkerManager.execute(code, language, parameters, ...)
      - Inyecta variables del VariableRegistry en el namespace
      - exec(code) en thread o subproceso venv
      - Si yield: modo streaming con StreamChannel
      - Si R: envía JSON al proceso R, espera respuesta
   c. Variables nuevas → PlasmaStore → VariableRegistry
   d. Emite output del nodo → Electron → workflowStore.appendNodeOutput()
   e. Emite state_change "success" o "error"

7. Al terminar todos los nodos:
   a. PlasmaStore.clear() — libera /dev/shm/
   b. orchestrator.py emite {type: "execution_complete", status: "success"}
   c. Electron reenvía como 'workflow:complete' → workflowStore.setStatus('completed')
   d. React fetches variables y datasets actualizados

8. Usuario ve resultados en DataView / VariableInspector
```

---

## 🛡️ Datos Sensibles y Configuración

- **Settings**: `userData/gardenia-settings.json` — paths de Python/R, preferencias
- **Proyectos**: `userData/projects/` — `.leaf` files y directorio de datos
- **Índice**: `userData/projects-index.json` — lista de proyectos y carpetas
- **Datasets**: `userData/data/` — DataFrames persistidos entre sesiones
- **Logs**: stderr del proceso Python (visible en DevTools de Electron en dev mode)
