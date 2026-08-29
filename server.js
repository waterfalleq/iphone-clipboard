const express = require("express");
const multer = require("multer");

const app = express();
const port = 3000;
const upload = multer({ dest: "uploads/" });

app.get("/", (request, response) => {
  console.log("GET /");
  response.type("text/plain").send("hello");
});

app.post("/upload", upload.single("image"), (request, response) => {
  if (!request.file) {
    response.status(400).json({ error: "No image uploaded" });
    return;
  }

  console.log("Received file:", request.file);

  response.json({
    message: "File received",
    filename: request.file.filename,
  });
});

app.use((request, response) => {
  console.log(request.method, request.url);
  response.status(404).send("not found");
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});