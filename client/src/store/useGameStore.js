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
            roomId: null,
            isHost: false,
            isReady: false,
            myCards: [],          // Mảng bài mình đang cầm
            selectedCards: [],

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
            players: [],    // 
            /*  { 
                id: 1, 
                name: '', 
                avatar: '', 
                status: "PLAYER" or "SPECTATOR" or "OFFLINE"
                isHost: false, 
                isReady: false,
                isPassTurn: false
                } */

            // Dữ liệu bài bạc
            gameState: 'WAITING', // WAITING (Chờ chia bài), PLAYING (Đang đánh), FINISHED (Kết thúc)
            tableCards: [],       // Mảng bài đang ở giữa bàn
            currentTurnId: null,    // Đang là lượt của userId nào
            winnerId: null,
            gameResult: null, // Lưu Bảng Xếp Hạng khi ván kết thúc
            roomCardsMap: {}, // Host dùng cái này để theo dõi bài của mọi người

            // ==========================================
            // 3. CÁC HÀM CẬP NHẬT (ACTIONS)
            // ==========================================
            setRoomInfo: (roomId, isHost) => set({ roomId, isHost }),

            // Hàm lưu bài của mình vào túi
            setMyCards: (cards) => set({ myCards: cards }),
            removeCards: (ids) =>
                set((state) => ({
                    myCards: state.myCards.filter((c) => !ids.includes(c.id)),
                })),

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

            hasPlayer: (id) => {
                return get().players.some((p) => p.id === id);
            },

            addOrUpdatePlayer: (player) =>
                set((state) => {
                    const exists = state.players.some(
                        (p) => p.id === player.id
                    );

                    if (exists) {
                        return {
                            players: state.players.map((p) =>
                                p.id === player.id
                                    ? { ...p, ...player }
                                    : p
                            ),
                        };
                    }

                    return {
                        players: [...state.players, player],
                    };
                }),

            removePlayer: (id) =>
                set((state) => ({
                    players: state.players.filter((p) => p.id !== id),
                })),
            removePlayers: (ids) =>
                set((state) => ({
                    players: state.players.filter((p) => !ids.includes(p.id)),
                })),

            updatePlayer: (id, payload) =>
                set((state) => ({
                    players: state.players.map((p) => {
                        if (p.id !== id) return p;

                        // hỗ trợ cả object và function (realtime-safe)
                        if (typeof payload === "function") {
                            return payload(p);
                        }

                        return { ...p, ...payload };
                    }),
                })),

            updatePlayers: (ids, payload) =>
                set((state) => ({
                    players: state.players.map((p) => {
                        if (ids && ids.length > 0 && !ids.includes(p.id)) return p;

                        // hỗ trợ cả object và function (realtime-safe)
                        if (typeof payload === "function") {
                            return payload(p);
                        }

                        return { ...p, ...payload };
                    }),
                })),

            setPlayers: (players) => set({ players }),

            addOrUpdateRoomCards: (userId, cards) =>
                set((state) => ({
                    roomCardsMap: {
                        ...state.roomCardsMap,
                        [userId]: cards,
                    },
                })),

            // Hàm Rời phòng / Xóa phiên chơi
            leaveRoom: () => set({
                roomId: null,
                isHost: false,
                isReady: false,
                myCards: [],
                selectedCards: [],

                gameState: 'WAITING',
                players: [],
                tableCards: [],       // Mảng bài đang ở giữa bàn
                currentTurnId: null,    // Đang là lượt của userId nào
                isMyTurn: false,
                winnerId: null,
                gameResult: null, // Lưu Bảng Xếp Hạng khi ván kết thúc
                roomCardsMap: {} // Host dùng cái này để theo dõi bài của mọi người
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
                isReady: state.isReady,
                myCards: state.myCards,
                selectedCards: state.selectedCards,
                players: state.players,
            }),
        }
    )
);