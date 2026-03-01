// client/src/components/Lobby.jsx
import { useState, useMemo } from 'react';
import { createAvatar } from '@dicebear/core';
import { funEmoji } from '@dicebear/collection';
import { Dices, LogIn } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';

export default function Lobby({ onJoinRoom, onCreateRoom }) {
    const { name: storedName, initUser } = useGameStore();

    const [name, setName] = useState(storedName || '');
    const [roomCode, setRoomCode] = useState('');
    const [isJoining, setIsJoining] = useState(false); // Biến này điều khiển việc ẩn/hiện ô nhập mã

    const handleNameChange = (e) => {
        setName(e.target.value);
    };

    const avatar = useMemo(() => {
        return createAvatar(funEmoji, {
            seed: name || 'random-seed',
            radius: 50,
        }).toDataUri();
    }, [name]);

    const handleCreateClick = () => {
        initUser(name, avatar);
        onCreateRoom(name, avatar);
    };

    const handleJoinClick = () => {
        initUser(name, avatar);
        onJoinRoom(roomCode, name, avatar);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
            <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl max-w-md w-full border border-slate-700">
                <h1 className="text-3xl font-bold text-center text-yellow-400 mb-6 tracking-wider">
                    🃏 SÂM LỐC WEB
                </h1>

                <div className="flex flex-col items-center mb-8">
                    <img src={avatar} alt="Avatar" className="w-24 h-24 rounded-full mb-4 bg-slate-700 p-1" />
                    <input
                        type="text"
                        placeholder="Nhập tên của bạn..."
                        value={name}
                        onChange={handleNameChange}
                        className="w-full text-center px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
                    />
                </div>

                {/* CỤM ĐIỀU KIỆN ẨN HIỆN NẰM Ở ĐÂY */}
                {!isJoining ? (
                    <div className="space-y-4">
                        <button
                            onClick={handleCreateClick}
                            disabled={!name}
                            className="w-full flex items-center justify-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-slate-900 font-bold py-3 px-4 rounded-lg transition disabled:opacity-50"
                        >
                            <Dices size={20} />
                            Tạo phòng mới
                        </button>
                        <button
                            onClick={() => setIsJoining(true)} // Bấm vào đây sẽ chuyển sang màn nhập mã
                            className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition"
                        >
                            <LogIn size={20} />
                            Tham gia phòng
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4 animate-fade-in">
                        <input
                            type="text"
                            placeholder="Nhập mã phòng (5 ký tự)"
                            value={roomCode}
                            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                            maxLength={5}
                            className="w-full text-center tracking-widest px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white text-xl focus:outline-none focus:border-blue-400"
                        />
                        <button
                            onClick={handleJoinClick}
                            disabled={!name || roomCode.length < 5}
                            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg transition disabled:opacity-50"
                        >
                            Vào phòng ngay
                        </button>
                        <button
                            onClick={() => setIsJoining(false)} // Nút quay lại
                            className="w-full text-sm text-slate-400 hover:text-white transition mt-2"
                        >
                            ← Quay lại
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}