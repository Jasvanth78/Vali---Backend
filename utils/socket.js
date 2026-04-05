const { Server } = require("socket.io");

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*", // Adjust in production
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log("Client connected to socket:", socket.id);
    
    socket.on("disconnect", () => {
      console.log("Client disconnected from socket:", socket.id);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

const emitLiveUpdate = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

const emitAppContentUpdate = (data) => {
  if (io) {
    io.emit("appContentUpdate", data);
  }
};

module.exports = { initSocket, getIO, emitAppContentUpdate, emitLiveUpdate };
