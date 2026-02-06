# Gardenia Desktop

Desktop application built with Electron, Vite, and React.

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm (usually comes with Node.js)

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/siouxi/gardenia.git
    cd gardenia
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```
    *This command reads `package.json` and installs all necessary libraries into the `node_modules` folder.*

### Development

To run the application in development mode:

```bash
npm run electron:dev
```

### Build

To build the application for production:

```bash
npm run build
```

## Project Structure

- `src/`: React application source code
- `electron/`: Electron main process source code
- `dist/`: Build output
