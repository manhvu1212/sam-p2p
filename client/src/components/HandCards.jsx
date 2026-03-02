// client/src/components/HandCards.jsx
import { useMemo } from 'react';
import { canPlay } from '../utils/gameLogic';
import { useGameStore } from '../store/useGameStore';
import Card from './Card';

export default function HandCards({ onPlayCards, onPassTurn }) {
    const { gameState, isReady, myCards, selectedCards, tableCards, toggleCardSelection } = useGameStore();
    const isMyTurn = useGameStore(
        (s) => s.currentTurnId === s.userId,
    );

    // 1. Chuyển đổi ID bài đang chọn thành Object bài đầy đủ
    const selectedCardsObj = useMemo(() => {
        return myCards.filter(card => selectedCards.includes(card.id));
    }, [selectedCards, myCards]);

    // 2. Kiểm tra xem bộ bài đang chọn có "hợp lệ" để đánh hay không
    const isPlayable = useMemo(() => {
        if (!isMyTurn) return false
        if (selectedCards.length === 0) return false;

        // Gọi hàm canPlay từ gameLogic.js
        // Tham số: (Bài đang chọn, Bài trên bàn, Tất cả bài trên tay)
        return canPlay(selectedCardsObj, tableCards, myCards);
    }, [selectedCardsObj, tableCards, myCards, isMyTurn]);

    const canPass = isMyTurn && tableCards && tableCards.length > 0;

    const getOverlapStyle = (index) => {
        if (index === 0) return { marginLeft: '0px' };

        const screenW = window.innerWidth;
        const isMobile = screenW < 768;

        // 1. Định nghĩa kích thước bài (khớp với class w-22 và md:w-35)
        const cardWidth = isMobile ? 88 : 140;

        // 2. Khoảng cách "đẹp nhất" (Hở 50% quân bài)
        // Nghĩa là quân sau đè lên quân trước một nửa. Overlap = -50% width
        const idealOverlap = -(cardWidth * 0.5);

        // 3. Tính toán không gian thực tế
        // Trừ đi 32px padding (px-4) để bài không chạm sát mép màn hình
        const containerWidth = screenW - 32;
        const totalCards = myCards.length;

        // 4. Tính toán Overlap cần thiết để vừa khít màn hình
        // Công thức: (ContainerWidth - CardWidth) / (TotalCards - 1) - CardWidth
        const requiredOverlap = (containerWidth - cardWidth) / (totalCards - 1) - cardWidth;

        // 5. LỰA CHỌN THÔNG MINH:
        // Nếu khoảng cách "đẹp" (-50%) vẫn làm bài bị tràn màn hình -> Dùng requiredOverlap
        // Nếu bài ít, khoảng cách requiredOverlap quá thưa -> Dùng idealOverlap
        const finalOverlap = Math.min(idealOverlap, requiredOverlap);

        return {
            marginLeft: `${finalOverlap}px`,
            transition: 'margin-left 0.3s ease-out' // Thêm hiệu ứng mượt mà khi đánh bài
        };
    };

    return (
        /* CONTAINER CHÍNH: Chiếm trọn 40% (hoặc 30%) của bạn.
           Dùng flex-col và justify-start để bộ bài luôn đứng ở trên cùng khu vực này.
        */
        <div className="w-full h-full relative flex flex-col items-center justify-start pt-6 overflow-hidden">

            {/* 1. KHU VỰC CÁC LÁ BÀI */}
            <div className="flex justify-center items-start w-full px-4 overflow-visible">
                {myCards.map((card, index) => {
                    const isSelected = selectedCards.includes(card.id);

                    return (
                        <Card
                            key={card.id}
                            card={card}
                            onClick={() => toggleCardSelection(card.id)}
                            style={{
                                ...getOverlapStyle(index),
                                zIndex: index, // GIỮ NGUYÊN Z-INDEX: Quân sau đè quân trước
                                flexShrink: 0
                            }}
                            className={`
                                    w-22 md:w-35 cursor-pointer
                                    ${isSelected
                                    ? '-translate-y-5 border-blue-500 ring-2 ring-blue-400'
                                    : 'hover:-translate-y-2'
                                }
                            `}
                        />
                    );
                })}
            </div>

            {/* 2. NÚT ĐÁNH BÀI: 
                - Cách bài đúng 30px (mt-[30px]).
                - Nhưng dùng sticky hoặc căn chỉnh để nó không lọt xuống quá sâu.
                - Quan trọng: Nó nằm TRONG container này nên sẽ không bao giờ chạy mất.
            */}
            {/* CỤM NÚT ĐIỀU KHIỂN */}
            <div className="mt-[30px] mb-[20px] z-[100] sticky bottom-[20px] flex gap-4 items-center justify-center">
                { 

                }
                {/* NÚT BỎ LƯỢT - Chỉ hiện khi trên bàn đã có bài */}
                {canPass && (
                    <button
                        onClick={onPassTurn}
                        className="px-8 py-3 rounded-full font-black text-lg uppercase tracking-widest
                     transition-all duration-300 border-2 bg-slate-900 border-red-900/50 text-red-700
                     hover:border-red-600 hover:text-red-500 active:scale-95 cursor-pointer shadow-xl"
                    >
                        BỎ LƯỢT
                    </button>
                )}

                {/* NÚT ĐÁNH BÀI - GIỮ NGUYÊN CODE CỦA BÁC */}
                <div className="relative group">
                    {isPlayable && (
                        <div className="absolute inset-0 bg-blue-500 blur-2xl opacity-20 animate-pulse rounded-full"></div>
                    )}
                    <button
                        disabled={!isPlayable}
                        onClick={() => onPlayCards(selectedCardsObj)}
                        className={`
                                    relative px-14 py-3 rounded-full font-black text-lg uppercase tracking-widest
                                    transition-all duration-300 border-2
                                    ${isPlayable
                                                    ? 'bg-slate-900 border-blue-400 text-blue-400 shadow-xl active:scale-95 cursor-pointer'
                                                    : 'bg-slate-800 border-slate-700 text-slate-600 cursor-not-allowed opacity-80'
                                                }
                                `}
                    >
                        ĐÁNH {isPlayable && `[${selectedCards.length}]`}
                    </button>
                </div>
            </div>

        </div>
    );
}