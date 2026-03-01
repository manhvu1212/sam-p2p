// server/index.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

// Khởi tạo Socket.io và cho phép Frontend kết nối
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173", // Cổng mặc định của Vite React
        methods: ["GET", "POST"]
    },
    pingInterval: 10000,
    pingTimeout: 5000,
});

// server/index.js
const socketUserMap = {}; // Thêm một cuốn sổ ghi chép: socket.id -> { userId, roomId }

io.on('connection', (socket) => {
    console.log(`🟢 Một người chơi vừa kết nối: ${socket.id}`);

    socket.on('JOIN_ROOM', ({ roomId, user }) => {
        socket.join(roomId);

        // Ghi chép lại thông tin để lúc rớt mạng còn biết đường báo
        socketUserMap[socket.id] = { roomId, userId: user.id };

        socket.to(roomId).emit('ROOM_MESSAGE', `${user.name} đã vào phòng!`);
    });

    // Lắng nghe sự kiện chủ động thoát phòng (Bấm nút Thoát)
    socket.on('LEAVE_ROOM', ({ roomId, userId }) => {
        socket.leave(roomId); // Rút socket ra khỏi phòng này

        if (socketUserMap[socket.id]) {
            delete socketUserMap[socket.id]; // Xóa khỏi sổ tay
        }

        // Báo cho những người còn lại biết ông này đã bỏ chạy (Tận dụng luôn logic rớt mạng ở Client)
        socket.to(roomId).emit('GAME_UPDATE', {
            actionType: 'PLAYER_DISCONNECTED',
            payload: { userId }
        });

        console.log(`👋 Người chơi ${userId} đã chủ động thoát phòng: ${roomId}`);
    });

    socket.on('GAME_ACTION', (data) => {
        socket.to(data.roomId).emit('GAME_UPDATE', data);
    });

    // LOGIC NHẬN DIỆN RỚT MẠNG
    socket.on('disconnect', () => {
        console.log(`🔴 Người chơi đã ngắt kết nối: ${socket.id}`);

        const info = socketUserMap[socket.id];
        if (info) {
            // Hét lên cho cả phòng biết ông này vừa văng game
            socket.to(info.roomId).emit('GAME_UPDATE', {
                actionType: 'PLAYER_DISCONNECTED',
                payload: { userId: info.userId }
            });
            delete socketUserMap[socket.id]; // Xóa khỏi sổ
        }
    });
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`🚀 Trạm trung chuyển Sâm Lốc đang chạy tại port ${PORT}`);
});