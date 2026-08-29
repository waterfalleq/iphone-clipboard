const http = require("node:http");

const port = 3000;

const server = http.createServer((request, response) => {
  console.log(request.method, request.url);

  if (request.method === "GET" && request.url === "/") {
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end("hello");
    return;
  }

  response.statusCode = 404;
  response.end("not found");
});

server.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});