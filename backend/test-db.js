require("dotenv").config();

const { Client } = require("pg");

async function testDatabase() {
  console.log("Connecting to database...");

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 15000,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();

    console.log("SUCCESS: Database connected!");

    const result = await client.query("SELECT NOW()");
    console.log("Database response:", result.rows);

    await client.end();
  } catch (error) {
    console.error("FAILED: Database connection failed.");
    console.error("Error message:", error.message);
    console.error("Error code:", error.code || "No error code");

    try {
      await client.end();
    } catch {}
    
    process.exit(1);
  }
}

testDatabase();