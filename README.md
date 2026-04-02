# Raman Spectroscopy

A prototype web application for uploading Raman `.txt` files, visualizing spectra, and performing ML-based classification of individual spectra.

## Running the App

Only Docker and Docker Compose are required.

```bash
docker compose up --build
```

After startup, open in your browser:

http://localhost:8080

## Features

- upload Raman `.txt` files;
- parse metadata and spectrum structure;
- visualize a spectrum map or a single spectrum;
- run the selected spectrum through an ML model;
- highlight important spectral regions and key peaks.
