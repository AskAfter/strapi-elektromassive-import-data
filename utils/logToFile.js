import fs from "fs";
import { join } from "path";

// Function to log messages to a file with timestamp
export const logToFile = (message, dirname) => {
  const now = new Date();

  const localDate = now
    .toLocaleDateString("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .split(".")
    .reverse()
    .join("-");

  const localTime = now.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    fractionalSecondDigits: 3,
  });

  const localTimestamp = `${localDate}T${localTime}`;

  const logMessage = `[${localTimestamp}] ${message}\n`;
  const logPath = join(dirname, "app.log");

  fs.appendFile(logPath, logMessage, (err) => {
    if (err) {
      console.error("Error writing to log file:", err);
    }
  });
};
