import client from "prom-client";

// Kept dependency-free so background workers can emit metrics without importing Redis or queues.
export const prometheusRegistry = new client.Registry();

client.collectDefaultMetrics({ register: prometheusRegistry });
