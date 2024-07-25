import Router = require("./router");

const app = new Router();

// const app2 = new Router();ut

// app2.get(["/app2", "/app"], function () {
//   return new Response("app2");
// });

app.get(["/", "/other"], function () {
  return new Response("app");
});

//app.get(["/test", "/hello"], app2);

const server = app.listen();
