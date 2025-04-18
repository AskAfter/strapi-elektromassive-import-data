# 🚀 strapi-elektromassive-import-data

## 📋 Overview

This project provides utilities for data import and logging in a Strapi-based application. It includes functionality for logging messages to files and managing environment configurations.

## 🛠️ Installation

To get started with this project, follow these steps:

1. Clone the repository:

```sh
   git clone https://github.com/Yevgeniy-Dan/strapi-elektromassive-import-data.git
```

```sh
   cd strapi-elektromassive-import-data
```

2. Install dependencies:

```sh
   npm install
```

## 🚀 Usage

To use this project, you can utilize the provided npm scripts for different environments:

1. For development environment:

```
   npm run start:dev -- file-path lang=uk
```

2. For production environment:

```
   npm run start:prod -- file-path lang=uk
```

Example usage:

```
   npm run start:dev -- ./src/import-file.json lang=uk
```

This command will run the application in development mode and process the file located at `./src/import-file.json`.

📝 Note: Replace `file-path` with the actual path to your data file that you want to import.
