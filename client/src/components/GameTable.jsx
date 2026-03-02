import { useMemo } from 'react';
import { useGameStore } from '../store/useGameStore';
import Card from './Card';

export default function GameTable({ onDealCards }) {
    // Thêm currentTurnId để xử lý UI lượt đánh
    const { players, userId, isHost, gameState, tableCards, currentTurnId } = useGameStore();

    // 1. TRONG COMPONENT GameTable, sửa lại orderedPlayers:
    const orderedPlayers = useMemo(() => {
        // LỌC BỎ KHÁN GIẢ (SPECTATOR) TRƯỚC KHI XẾP GHẾ
        const activePlayers = players.filter(p => p.status !== 'SPECTATOR');
        const myIndex = activePlayers.findIndex(p => p.id === userId);
        if (myIndex === -1) return activePlayers;

        const result = [];
        for (let i = 0; i < activePlayers.length; i++) {
            result.push(activePlayers[(myIndex + i) % activePlayers.length]);
        }
        return result;
    }, [players, userId]);

    // 2. Tính toán vị trí tuyệt đối của từng người chơi xung quanh cái bàn hình tròn
    // Trả về mảng các Object chứa style { top, left, transform }
    const playerPositions = useMemo(() => {
        const totalPlayers = orderedPlayers.length;
        if (totalPlayers === 0) return [];
        if (totalPlayers === 1) return [{ top: 'auto', left: '50%', bottom: '10px', transform: 'translateX(-50%)' }];

        const positions = [];
        // Bán kính của vòng tròn định vị (phần trăm so với container cha)
        // Điều chỉnh con số này để Avatar nằm gần hoặc xa mép bàn
        const radius = 42;

        for (let i = 0; i < totalPlayers; i++) {
            // Góc bắt đầu là 90 độ (dưới cùng) để mình nằm ở đó
            // Góc tính bằng Radian: (Góc độ * PI) / 180
            const angleDeg = 90 + (i * (360 / totalPlayers));
            const angleRad = (angleDeg * Math.PI) / 180;

            // Tính toán x, y dựa trên công thức đường tròn: x = cos(a), y = sin(a)
            // Kết quả trả về từ -1 đến 1, sau đó chuyển đổi thành phần trăm từ 0% đến 100%
            const x = 50 + radius * Math.cos(angleRad);
            const y = 50 + radius * Math.sin(angleRad);

            positions.push({
                top: `${y}%`,
                left: `${x}%`,
                // Dùng translate để tâm của Avatar nằm đúng vào điểm x, y đã tính
                transform: 'translate(-50%, -50%)',
            });
        }
        return positions;
    }, [orderedPlayers]);

    // 3. Tính toán Giao diện bài trên bàn (Chia dòng chủ động tuyệt đối)
    const getTableCardsLayout = (cards) => {
        if (!cards || cards.length === 0) return { rows: [], overlap: 0, cardClass: "" };

        const total = cards.length;
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;

        // A. HẠ SIZE BÀI XUỐNG CHO VỪA VẶN HƠN
        let cardW = 64;
        let cardClass = "w-16"; // Mobile
        if (screenW >= 1024) { cardW = 96; cardClass = "w-24"; } // PC
        else if (screenW >= 640) { cardW = 80; cardClass = "w-20"; } // iPad

        const cardH = cardW * 1.5;

        // B. TÍNH DIỆN TÍCH BÀN 
        const availableHeight = screenH * 0.6;
        const tableDiameter = Math.min(screenW * 0.85, availableHeight * 0.85);
        const containerWidth = tableDiameter * 0.8 - 32; // Trừ hao an toàn
        const containerHeight = tableDiameter * 0.8 - 32;

        // C. LOGIC BẺ DÒNG
        const minVis = cardW * 0.5;
        const maxOverlap = -(cardW - minVis);
        const reqWidth = cardW + (total - 1) * (cardW + maxOverlap);
        const canFitTwo = containerHeight >= (cardH * 1.9);

        let numRows = 1;
        if (reqWidth > containerWidth && canFitTwo) {
            numRows = 2;
        }

        // D. TÍNH SỐ BÀI MỖI DÒNG & KHOẢNG ĐÈ
        const cardsPerRow = Math.ceil(total / numRows);
        let overlap = (containerWidth - cardW) / (cardsPerRow - 1) - cardW;

        if (cardsPerRow <= 1) overlap = 0;
        else {
            if (overlap > -cardW * 0.15) overlap = -cardW * 0.15;
            if (overlap < maxOverlap) overlap = maxOverlap;
        }

        // E. CHỦ ĐỘNG CẮT MẢNG BÀI THÀNH CÁC DÒNG RIÊNG BIỆT (KHẮC PHỤC LỖI CÁCH XA NHAU)
        const rowChunks = [];
        for (let i = 0; i < total; i += cardsPerRow) {
            rowChunks.push(cards.slice(i, i + cardsPerRow));
        }

        return { rows: rowChunks, overlap, cardClass };
    };

    return (
        <div className="relative w-full h-full max-w-5xl mx-auto flex items-center justify-center">

            {/* BÀN CHƠI HÌNH TRÒN */}
            {/* aspect-square để luôn giữ khung hình vuông, rounded-full để tạo hình tròn */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] h-[85%] aspect-square bg-green-800 rounded-full border-8 md:border-[16px] border-green-950 shadow-[inset_0_0_50px_rgba(0,0,0,0.6),0_10px_30px_rgba(0,0,0,0.5)] flex items-center justify-center z-10">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] aspect-square border-4 border-dashed border-green-700/50 rounded-full flex items-center justify-center p-4 md:p-8 z-50 pointer-events-none">
                </div>
            </div>

            {/* RENDER NGƯỜI CHƠI (Avatar) */}
            {orderedPlayers.map((player, index) => {
                const isMe = index === 0;
                // Lấy vị trí đã tính toán từ playerPositions
                const positionStyle = playerPositions[index];
                // Kiểm tra lượt đánh
                const isTurn = player.id === currentTurnId;
                const isOffline = player.status === 'OFFLINE';

                return (
                    <div key={player.id} style={positionStyle} className={`absolute flex flex-col items-center transition-all duration-500 ${isTurn ? 'scale-110 z-30' : 'scale-90 z-20'}`}>
                        {player.isReady && gameState === 'WAITING' && (
                            <span className="absolute -top-3 md:-top-4 bg-yellow-500 text-slate-900 text-[8px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-full z-40 shadow-md">Ready</span>
                        )}

                        {/* Nếu Offline, hiện chữ đỏ cảnh báo đè lên Avatar */}
                        {isOffline && (
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-red-600/90 text-white text-[8px] md:text-[10px] font-black px-2 py-1 rounded w-max shadow-xl rotate-[-15deg] whitespace-nowrap">
                                ĐỨT CÁP ⏳
                            </div>
                        )}

                        {/* AVATAR: Sáng rực khi tới lượt, Xám xịt khi chờ */}
                        <div className={`relative rounded-full p-1 transition-all duration-300 shadow-2xl
                            ${isMe ? 'w-12 h-12 sm:w-16 sm:h-16 md:w-24 md:h-24' : 'w-10 h-10 sm:w-12 sm:h-12 md:w-20 md:h-20'}
                            ${isTurn
                                ? 'bg-yellow-400 border-2 border-yellow-200 shadow-[0_0_25px_rgba(250,204,21,0.8)] ring-4 ring-yellow-400/30'
                                : 'bg-slate-800 border-2 border-slate-700'
                            }
                        `}>
                            <img src={player.avatar} alt={player.name} className={`w-full h-full rounded-full bg-slate-700 object-cover transition-all duration-300`} />
                        </div>

                        {/* BẢNG TÊN: Tối giản, rực rỡ khi tới lượt */}
                        <div className={`mt-2 px-3 py-0.5 md:py-1 rounded-full border shadow-md transition-colors duration-300
                            ${isTurn
                                ? 'bg-yellow-500 border-yellow-400 text-slate-900 font-black shadow-[0_0_15px_rgba(250,204,21,0.5)]'
                                : 'bg-slate-900/90 border-slate-700 text-slate-400 font-bold backdrop-blur-sm'
                            }
                        `}>
                            <span className="text-[9px] md:text-xs block text-center truncate max-w-[60px] md:max-w-[120px]">
                                {player.name}
                            </span>
                        </div>
                    </div>
                );
            })}

            {/* 3. KHU VỰC ĐÁNH BÀI (Render theo từng dòng riêng biệt) */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] aspect-square flex items-center justify-center p-4 md:p-8 z-50 pointer-events-none">

                {tableCards && tableCards.length > 0 ? (() => {
                    const layout = getTableCardsLayout(tableCards);

                    return (
                        // Bọc ngoài bằng flex-col để các dòng xếp chồng lên nhau
                        <div className="flex flex-col items-center justify-center gap-y-2 md:gap-y-4 w-full">

                            {/* Duyệt qua từng dòng (Mảng nhỏ) */}
                            {layout.rows.map((rowCards, rowIndex) => (
                                // Mỗi dòng là 1 thẻ flex riêng biệt -> ÉP BUỘC NÓ PHẢI NẰM ĐÚNG DÒNG
                                <div key={rowIndex} className="flex justify-center items-center w-full">

                                    {rowCards.map((card, idx) => (
                                        <Card
                                            key={card.id}
                                            card={card}
                                            style={{
                                                // Lá bài đầu tiên của mỗi dòng không đè
                                                marginLeft: idx === 0 ? '0px' : `${layout.overlap}px`,
                                                zIndex: 50 + (rowIndex * 10) + idx
                                            }}
                                            className={`${layout.cardClass} shrink-0 transition-all duration-300 shadow-2xl pointer-events-auto`}
                                        />
                                    ))}

                                </div>
                            ))}

                        </div>
                    );
                })() : (
                    <span className="text-green-900/40 font-black text-xl md:text-4xl uppercase tracking-widest text-center px-4 leading-tight drop-shadow-lg">
                        Khu Vực<br />Đánh Bài
                    </span>
                )}
            </div>

            {/* NÚT CHIA BÀI */}
            {isHost && gameState === 'WAITING' && orderedPlayers.every(p => p.isReady) && (
                <button onClick={onDealCards} className="absolute bottom-[20%] left-1/2 -translate-x-1/2 px-5 py-2.5 md:px-8 md:py-4 text-[12px] md:text-lg bg-yellow-500 hover:bg-yellow-600 text-slate-900 font-black rounded-full shadow-2xl z-40 transition active:scale-95 uppercase tracking-wider">
                    CHIA BÀI
                </button>
            )}
        </div>
    );
}