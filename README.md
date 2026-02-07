# Gardenia

Gardenia is a desktop application for data workflow orchestration, specifically designed for **biology, medicine, and omics** research. It is built with Electron, React, Python, and R to provide a powerful environment for scientific data analysis.

## Prerequisites

To run this project, you will need the following installed on your system:

1.  **Node.js**: v18.0.0 or higher.
    - [Download Node.js](https://nodejs.org/)
2.  **Python**: v3.10 or higher.
    - We recommended using [Miniconda](https://docs.conda.io/en/latest/miniconda.html) or Anaconda to manage environments.
3.  **R**: Latest stable version.
    - [Download R](https://cran.r-project.org/)

## Setup Instructions

Clone the repository and follow these steps to set up the environment.

### 1. Frontend (Node.js)

Navigate to the `gardeniaclient` directory and install dependencies:

```bash
cd gardeniaclient
npm install
```

### 2. Backend (Python)

Navigate to the `engine` directory and install the required Python packages.

**Using pip:**

```bash
cd engine
pip install -r requirements.txt
```

**Using Conda (Recommended):**

```bash
conda create -n gardenia python=3.10
conda activate gardenia
cd engine
pip install -r requirements.txt
```

### 3. R Dependencies

The application requires the `jsonlite` package to communicate with R. Open your R terminal or RStudio and run:

```R
install.packages("jsonlite")
```

## Running the Application

### Development Mode

To run the application in development mode with hot-reloading:

1.  Ensure your Python environment is active (if using Conda).
2.  Run the following command from the `gardeniaclient` directory:

```bash
cd gardeniaclient
npm run electron:dev
```

### Building for Production

To build the application executable:

```bash
cd gardeniaclient
npm run build
```

The output will be in `gardeniaclient/dist`.
