// client/src/socket.js
import { io } from 'socket.io-client';

// Kết nối tới Backend đang chạy ở port 3001
const URL = 'http://localhost:3001';
export const socket = io(URL, {
  autoConnect: false // Tạm thời chưa tự động kết nối ngay khi mở web
});