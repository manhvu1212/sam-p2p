// client/src/store/useGameStore.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';

export const useGameStore = create(
    persist(
        (set, get) => ({
            // ==========================================
            // 1. DỮ LIỆU CÁ NHÂN (Cố định theo trình duyệt)
            // ==========================================
            userId: null,
            name: '',
            avatar: '',

            initUser: (name, avatar) => {
                const currentId = get().userId;
                set({
                    userId: currentId || `user_${nanoid(8)}`, // Sinh ID ngẫu nhiên 8 ký tự
                    name,
                    avatar
                });
            },

            // ==========================================
            // 2. DỮ LIỆU PHÒNG & TRẠNG THÁI VÁN ĐẤU
            // ==========================================
            roomId: null,
            isHost: false,
            gameState: 'WAITING', // WAITING (Chờ chia bài), PLAYING (Đang đánh), ENDING (Kết thúc)
            players: [],

            // Dữ liệu bài bạc
            myCards: [],          // Mảng bài mình đang cầm
            tableCards: [],       // Mảng bài đang ở giữa bàn
            currentTurn: null,    // Đang là lượt của userId nào
            selectedCards: [],
            roomCardsMap: {}, // Host dùng cái này để theo dõi bài của mọi người
            gameResult: null, // Lưu Bảng Xếp Hạng khi ván kết thúc
            winnerId: null,
            
            // ==========================================
            // 3. CÁC HÀM CẬP NHẬT (ACTIONS)
            // ==========================================
            setRoomInfo: (roomId, isHost) => set({ roomId, isHost }),

            // Hàm lưu bài của mình vào túi
            setMyCards: (cards) => set({ myCards: cards }),

            toggleCardSelection: (cardId) => set((state) => {
                const isSelected = state.selectedCards.includes(cardId);
                if (isSelected) {
                    // Nếu đang chọn rồi -> bỏ chọn (xóa khỏi mảng)
                    return { selectedCards: state.selectedCards.filter(id => id !== cardId) };
                } else {
                    // Nếu chưa chọn -> thêm vào mảng
                    return { selectedCards: [...state.selectedCards, cardId] };
                }
            }),

            // Hàm xóa sạch bài đang chọn (dùng khi vừa đánh bài ra xong)
            clearSelectedCards: () => set({ selectedCards: [] }),

            // Hàm cập nhật trạng thái chung chung
            updateGameState: (newState) => set((state) => ({ ...state, ...newState })),

            // Hàm Rời phòng / Xóa phiên chơi
            leaveRoom: () => set({
                roomId: null,
                isHost: false,
                gameState: 'WAITING',
                players: [],
                myCards: [],
                selectedCards: [],
                tableCards: [],
                currentTurn: null
            })
        }),
        {
            name: 'samloc-local-storage',
            partialize: (state) => ({
                userId: state.userId,
                name: state.name,
                avatar: state.avatar,
                roomId: state.roomId,
                isHost: state.isHost,
                myCards: state.myCards,     // Lỡ F5 thì vẫn giữ lại bài trên tay
                gameState: state.gameState
            }),
        }
    )
);