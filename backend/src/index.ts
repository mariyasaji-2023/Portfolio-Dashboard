import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import portfolioRoute from "./api/portfolio.route";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// ✅ Test API route
app.get("/api/test", (req, res) => {
  res.json({ message: "Backend is working!" });
});

app.use("/api/portfolio", portfolioRoute);


app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
