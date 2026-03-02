// client/src/utils/gameLogic.js

const SUITS = ['spades', 'clubs', 'diamonds', 'hearts']; // Bích, Tép, Rô, Cơ
// Thứ tự từ bé đến lớn trong Sâm: 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A, 2
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

// Tạo bộ bài chuẩn 52 lá
export const createDeck = () => {
    let deck = [];
    RANKS.forEach((rank, index) => {
        SUITS.forEach(suit => {
            deck.push({
                id: `${rank}_${suit}`,
                rank: rank,
                suit: suit,
                power: index + 3, // Logic so sánh: 3 có power=3, ..., 2 có power=15 (To nhất)
            });
        });
    });
    return deck;
};

// Hàm xào bài ngẫu nhiên (Fisher-Yates Shuffle)
export const shuffleDeck = (deck) => {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

/**
 * Nhận diện loại bộ bài (Combo Detection)
 */
export const getCombo = (cards) => {
    const len = cards.length;
    if (len === 0) return null;

    // Sắp xếp bài theo power tăng dần
    const sorted = [...cards].sort((a, b) => a.power - b.power);
    const powers = sorted.map(c => c.power);

    // 1. Rác (Single)
    if (len === 1) return { type: 'SINGLE', weight: powers[0] };

    // 2. Đôi, Sám, Tứ quý (Cùng rank/power)
    const isSameRank = powers.every(p => p === powers[0]);
    if (isSameRank) {
        if (len === 2) return { type: 'PAIR', weight: powers[0] };
        if (len === 3) return { type: 'TRIPLE', weight: powers[0] };
        if (len === 4) return { type: 'QUAD', weight: powers[0] };
    }

    // 3. Sảnh (Straight) - Tối thiểu 3 lá liên tiếp
    if (len >= 3) {
        // Sâm cho phép sảnh A-2-3 (3-14-15) và Q-K-A (12-13-14)
        // Nhưng thường không có sảnh K-A-2 (13-14-15) - tùy luật, ở đây làm chuẩn không K-A-2

        // Kiểm tra sảnh tiến bình thường
        let isNormalStraight = true;
        for (let i = 0; i < len - 1; i++) {
            if (powers[i + 1] !== powers[i] + 1) {
                isNormalStraight = false;
                break;
            }
        }

        // Kiểm tra sảnh đặc biệt A-2-3 (Power: 3, 14, 15)
        // Nếu sảnh có '2' (15) mà không phải sảnh A-2-3 thì không hợp lệ
        if (isNormalStraight) {
            if (powers.includes(15) && powers[0] !== 3) {
                // Có quân 2 nhưng không bắt đầu từ 3 (A-2-3-...) -> Không phải sảnh Sâm
                return null;
            }
            return { type: 'STRAIGHT', weight: powers[len - 1], length: len };
        }
    }

    return null; // Không thuộc bộ nào
};

/**
 * Kiểm tra xem các lá bài còn lại CÓ PHẢI CHỈ TOÀN LÀ 2 HOẶC TỨ QUÝ hay không
 * Để tránh trường hợp người chơi tự "nhốt" mình (đánh xong trên tay chỉ còn 2/Tứ quý -> Thối chắc)
 */
const isRemainingThoi = (remainingCards) => {
    if (remainingCards.length === 0) return false;

    // Kiểm tra xem TẤT CẢ các lá bài còn lại có rơi vào 2 trường hợp này không:
    // 1. Là con Heo (power = 15)
    // 2. Nằm trong một Tứ quý
    const isAllHeoOrQuad = remainingCards.every(c => {
        // Nếu lá bài là Heo -> bị tính là bài thối
        if (c.power === 15) return true;

        // Nếu lá bài nằm trong Tứ quý -> bị tính là bài thối
        const countSameRank = remainingCards.filter(rc => rc.power === c.power).length;
        if (countSameRank === 4) return true;

        // Nếu có bất kỳ lá rác, đôi, sảnh nào khác -> an toàn, không bị nhốt!
        return false;
    });

    return isAllHeoOrQuad;
};

/**
 * Hàm so bài (Chặn bài) phiên bản Sâm Lốc
 */
export const canPlay = (newCards, tableCards, playerHand) => {
    const newCombo = getCombo(newCards);
    if (!newCombo) return false;

    const newCardsIds = newCards.map(c => c.id);
    const remainingCards = playerHand.filter(c => !newCardsIds.includes(c.id));

    // --- 1. LUẬT VỀ NHẤT (Không được đánh Heo / Tứ quý cuối cùng) ---
    if (remainingCards.length === 0) {
        if (newCombo.type === 'SINGLE' && newCombo.weight === 15) return false; // Cấm thối 2
        if (newCombo.type === 'QUAD') return false; // Cấm thối Tứ quý
    }
    // --- 2. LUẬT TỰ NHỐT (Đánh xong bài còn lại CHỈ TOÀN 2 hoặc Tứ quý) ---
    else {
        if (isRemainingThoi(remainingCards)) {
            return false;
        }
    }

    // --- 3. LOGIC SO BÀI VỚI BÀN ---
    if (!tableCards || tableCards.length === 0) return true;

    const tableCombo = getCombo(tableCards);
    if (!tableCombo) return true; // Đề phòng lỗi dữ liệu bàn

    if (newCombo.type === tableCombo.type && newCards.length === tableCards.length) {
        if (newCombo.weight === tableCombo.weight) return false;
        return newCombo.weight > tableCombo.weight;
    }

    if (newCombo.type === 'QUAD' && tableCombo.type === 'SINGLE' && tableCards[0].power === 15) {
        return true; // Tứ quý chặt Heo
    }

    if (newCombo.type === 'QUAD' && tableCombo.type === 'QUAD') {
        return newCombo.weight > tableCombo.weight; // Tứ quý to chặt Tứ quý nhỏ
    }

    return false;
};

/**
 * Hàm tìm ID của người chơi tiếp theo (bỏ qua những người đã Pass)
 * @param {string} currentUserId - ID của người vừa đánh hoặc vừa bỏ lượt
 * @param {Array} players - Mảng danh sách người chơi trong phòng
 * @returns {string} - ID của người sẽ được cấp quyền đánh tiếp theo
 */
export const getNextTurnId = (currentUserId, players) => {
    // Tìm vị trí của người hiện tại trong mảng
    const currentIndex = players.findIndex(p => p.id === currentUserId);
    if (currentIndex === -1) return null;

    // Duyệt vòng tròn để tìm người gần nhất chưa bỏ lượt
    // Dùng vòng lặp tối đa bằng số người chơi để tránh lặp vô hạn
    for (let i = 1; i <= players.length; i++) {
        const nextIndex = (currentIndex + i) % players.length;
        const nextPlayerId = players[nextIndex].id;

        // Nếu ID này không nằm trong danh sách sổ đen (đã bỏ lượt) -> Tới lượt ông này!
        if (!nextPlayerId.isPassTurn) {
            return nextPlayerId;
        }
    }

    // Nếu tất cả đều pass (thực tế hiếm xảy ra nếu logic dọn bàn chuẩn), trả về chính nó
    return currentUserId;
};

/**
 * Tính toán kết quả ván đấu dựa trên bài mọi người lật lên
 */
export const calculateGameResults = (winnerId, players, revealedCardsMap) => {
    if (!winnerId || !players) return []
    
    const results = [];
    let totalPenalty = 0;

    players.forEach(p => {
        if (p.status === 'SPECTATOR') return; // Khán giả xem free, không bị phạt

        // 1. NGƯỜI VỀ NHẤT
        if (p.id === winnerId) {
            results.push({
                id: p.id, name: p.name, avatar: p.avatar,
                role: 'WINNER', score: 0, detail: 'VỀ NHẤT', remainingCards: []
            });
            return;
        }

        // 2. NGƯỜI THUA
        if (revealedCardsMap[p.id]) {
            // Nếu họ đã bắn bài lên mạng
            const cardsLeft = revealedCardsMap[p.id];
            let score = -cardsLeft.length; // Cơ bản: Trừ 1 điểm / 1 lá
            let detail = `Còn ${cardsLeft.length} lá`;

            // Phạt Cóng (Chết ngộp - Còn nguyên 10 lá)
            if (cardsLeft.length === 10) {
                score = -15; // Phạt 15 điểm
                detail = 'CÓNG (Chết ngộp)';
            }

            // Phạt Thối Heo (Giả sử power của 4 con Heo >= 53 theo logic của bác)
            const heoCount = cardsLeft.filter(c => c.power >= 53).length;
            if (heoCount > 0) {
                score -= (heoCount * 5); // Phạt thêm 5 điểm / 1 con Heo
                detail += ` + Thối ${heoCount} Heo`;
            }

            totalPenalty += Math.abs(score);
            results.push({
                id: p.id, name: p.name, avatar: p.avatar,
                role: 'LOSER', score, detail, remainingCards: cardsLeft
            });
        } else {
            // Nếu data bài của họ chưa bay tới
            results.push({
                id: p.id, name: p.name, avatar: p.avatar,
                role: 'WAITING', score: '...', detail: 'Đang lật bài...', remainingCards: []
            });
        }
    });

    // 3. Gom hết tiền phạt trả cho người Thắng
    const winner = results.find(r => r.role === 'WINNER');
    if (winner) winner.score = totalPenalty > 0 ? `+${totalPenalty}` : 0;

    // Xếp hạng: Người Thắng lên đầu -> Người đã lật bài -> Người chưa lật bài
    return results.sort((a, b) => {
        if (a.role === 'WINNER') return -1;
        if (b.role === 'WINNER') return 1;
        return 0;
    });
};