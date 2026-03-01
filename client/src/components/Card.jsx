// client/src/components/Card.jsx

const SUIT_UI = {
    hearts: { symbol: '♥', color: 'text-red-600' },
    diamonds: { symbol: '♦', color: 'text-red-600' },
    clubs: { symbol: '♣', color: 'text-black' },
    spades: { symbol: '♠', color: 'text-black' }
};

export default function Card({ card, className = "", onClick, style = {} }) {
    if (!card) return null;
    const ui = SUIT_UI[card.suit] || { symbol: '?', color: 'text-gray-400' };

    return (
        <div
            onClick={onClick}
            style={style}
            className={`
        relative aspect-[2/3] bg-white rounded-lg border border-slate-300 
        shadow-md flex flex-col select-none transition-all duration-300 shrink-0
        shadow-lg
        p-1 md:p-2
        ${className}
      `}
        >
            {/* 1. GÓC TRÊN BÊN TRÁI: Chữ đứng thẳng, to rõ */}
            <div className={`flex flex-col items-center self-start leading-none ${ui.color}`}>
                {/* Bỏ italic, dùng font-black chuẩn */}
                <span className="text-[1.2rem] md:text-3xl font-black tracking-tight">
                    {card.rank}
                </span>
                <span className="text-[0.9rem] md:text-xl -mt-0.5">
                    {ui.symbol}
                </span>
            </div>

            {/* 2. PIP (KÝ HIỆU GIỮA): Luôn hiển thị, điều chỉnh cỡ cho mobile */}
            <div className={`
        absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 
        ${ui.color} opacity-[0.15]
        text-4xl md:text-7xl
      `}>
                {ui.symbol}
            </div>

            {/* 3. GÓC DƯỚI BÊN PHẢI: Xoay ngược đối xứng */}
            <div className={`flex flex-col items-center self-end leading-none rotate-180 mt-auto ${ui.color}`}>
                <span className="text-[1.2rem] md:text-3xl font-black tracking-tight">
                    {card.rank}
                </span>
                <span className="text-[0.9rem] md:text-xl -mt-0.5">
                    {ui.symbol}
                </span>
            </div>
        </div>
    );
}