import dotenv from "dotenv";
import "colors";

// Load environment variables from .env file
const env = process.env.NODE_ENV || "development";
dotenv.config({ path: `.env.${env}` });

console.log(`Environment variables loaded for ${env}`.blue);
