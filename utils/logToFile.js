import fs from "fs";
import { join } from "path";

// Function to log messages to a file with timestamp
export const logToFile = (message, dirname) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  const logPath = join(dirname, "app.log");

  fs.appendFile(logPath, logMessage, (err) => {
    if (err) {
      console.error("Error writing to log file:", err);
    }
  });
};
