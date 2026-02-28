# Gardenia

Gardenia is a desktop application designed for powerful data workflow orchestration, tailored specifically for **biology, medicine, and omics research**. Built on a flexible and high-performance stack, it provides an intuitive visual node editor for building complex data pipelines with seamless integration between Python and R.

---

## 🚀 Key Features

- **Visual Node Editor**: Build and manage complex analytical workflows via an interactive UI based on React Flow.
- **Polyglot Execution**: First-class support for both Python and R nodes. Keep your data analysis seamless across languages.
- **Zero-Copy IPC**: Fast and memory-efficient data transfer powered by PyArrow, virtually eliminating overhead between the frontend and the data engine.
- **Real-time Output & Logs**: Stream stdout, stderr, and rich text output (including dataframes and plots) directly into the app dashboard.
- **Built-in Package Management**: Easy environment configuration for Python scripts.

---

## 🏗 Architecture Overview

Gardenia employs a decoupled architecture optimized for scalability and performance:
1. **Frontend (Electron + React)**: Handles UI management, node-based workflow construction, and configuration forms. Uses Vite for rapid development.
2. **Orchestrator Engine (Python)**: Executes locally via multiple worker subprocesses. Controls workflow DAG validation, execution scheduling, and state persistence.
3. **Data Bridging**: Native data sharing layers through memory-mapped Arrow IPC chunks for high-speed exchanges between the language workers (Python/R) and the core application.

---

## 🛠 Prerequisites

Before starting, ensure you have the following software installed:

- **Node.js**: v18.0.0 or higher.
- **Python**: v3.10 or higher (We strongly recommend using [Miniconda](https://docs.conda.io/en/latest/miniconda.html) or Anaconda).
- **R**: The latest stable version ([Download R](https://cran.r-project.org/)).

---

## 📦 Step-by-Step Installation Guides

### 🪟 Windows

1. **Clone the Repository**:
   ```cmd
   git clone https://github.com/siouxi/gardenia.git
   cd gardenia
   ```

2. **Frontend Setup**:
   ```cmd
   cd gardeniaclient
   npm install
   ```

3. **Backend Setup (Python)**:
   It's recommended to use Anaconda Prompt. Return to the root, then:
   ```cmd
   conda create -n gardenia python=3.10
   conda activate gardenia
   cd engine
   pip install -r requirements.txt
   ```

4. **R Dependencies**:
   Open your R executable or RStudio, and install `jsonlite`:
   ```R
   install.packages("jsonlite")
   ```

### 🍎 macOS

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/siouxi/gardenia.git
   cd gardenia
   ```

2. **Frontend Setup**:
   ```bash
   cd gardeniaclient
   npm install
   ```

3. **Backend Setup (Python)**:
   Open your terminal and create a conda environment from the root folder:
   ```bash
   conda create -n gardenia python=3.10
   conda activate gardenia
   cd engine
   pip install -r requirements.txt
   ```

4. **R Dependencies**:
   Open an R terminal and install the required communication package:
   ```R
   install.packages("jsonlite")
   ```

### 🐧 Linux (Debian/Ubuntu/Fedora/Arch)

1. **Prerequisite Setup**:
   Ensure you have build tools installed.
   - For Debian/Ubuntu: `sudo apt install build-essential r-base`
   - For Fedora: `sudo dnf builddep r-base`
   - For Arch: `sudo pacman -S base-devel r`

2. **Clone the Repository**:
   ```bash
   git clone https://github.com/siouxi/gardenia.git
   cd gardenia
   ```

3. **Frontend Setup**:
   ```bash
   cd gardeniaclient
   npm install
   ```

4. **Backend Setup (Python)**:
   We recommend using Conda or a Python `venv` from the root folder:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   cd engine
   pip install -r requirements.txt
   ```

5. **R Dependencies**:
   In an R shell (`R`), type:
   ```R
   install.packages("jsonlite")
   ```
   > **Note for Bioconductor Users (Linux)**: If you plan to install complex Bioconductor packages (like `GEOquery`) via the Gardenia Package Manager, R will attempt to compile their C++ dependencies from scratch, which can take a very long time. It is highly recommended to install the pre-compiled system binaries first:
   > ```bash
   > sudo apt-get install r-cran-dplyr r-cran-tidyr r-cran-readr r-cran-httr r-cran-curl r-cran-openssl r-cran-rvest
   > ```

---

## ⚡ Running the Application

### Development Mode

To run Gardenia with hot-reloading for both the Electron main process and the React renderer:

1. **Ensure your Python environment is active** (e.g., `conda activate gardenia` or source `.venv`).
2. Navigate to the `gardeniaclient` directory:
   ```bash
   cd gardeniaclient
   npm run electron:dev
   ```

### Building for Production

To package the application into a standalone executable:

```bash
cd gardeniaclient
npm run build
```

The compiled binaries and installers will be placed in `gardeniaclient/dist`.

---

## 🤝 Contributing

We welcome contributions! Whether it's adding a new feature, fixing a bug, or improving the documentation, your help is appreciated. To contribute:

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

Feel free to open issues to discuss new features or report bugs.

---

## 📄 License

This project is licensed under the Apache License, Version 2.0. See the [LICENSE](LICENSE) file for more details.
