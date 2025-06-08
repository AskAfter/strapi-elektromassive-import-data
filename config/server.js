module.exports = ({ env }) => ({
  host: env("HOST", "0.0.0.0"),
  port: env.int("PORT", 1337),
  app: {
    keys: env.array("APP_KEYS"),
  },
});
// This code exports a configuration object for a server, allowing customization of the host, port, and application keys based on environment variables.
// It uses the `env` function to retrieve values, with defaults provided for host and port.
