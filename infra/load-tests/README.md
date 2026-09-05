# Load Testing

This directory contains k6 load testing scripts.

## Prerequisites

- [k6](https://k6.io/docs/get-started/installation/) must be installed on your machine.

## Running the Test

To run the load test, execute the following command:

```bash
k6 run infra/load-tests/sponsor-load-test.js
```

You can specify a different base URL using the `BASE_URL` environment variable:

```bash
BASE_URL=https://your-app-url.com k6 run infra/load-tests/sponsor-load-test.js
```
