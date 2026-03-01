import { useEffect, useState } from 'react';
import { socket } from './socket';
import Lobby from './components/Lobby';
import GameTable from './components/GameTable';
import HandCards from './components/HandCards';
import Card from './components/Card';
import { useGameStore } from './store/useGameStore';
import { createDeck, shuffleDeck, getNextTurnId, calculateGameResults } from './utils/gameLogic';

function App() {
  const {
    userId, name, avatar, roomId, isHost, players,
    setRoomInfo, updateGameState, currentTurnId, gameState, passedPlayerIds,
    gameResult
  } = useGameStore();

  // TÍNH TOÁN: Tìm xem người đang giữ lượt có phải đang OFFLINE không?
  const turnPlayer = players.find(p => p.id === currentTurnId);
  const isWaitingForOffline = turnPlayer?.status === 'OFFLINE';

  const [isConnected, setIsConnected] = useState(false);

  const [countdown, setCountdown] = useState(30); // THÊM DÒNG NÀY: State lưu thời gian đếm ngược
  // THÊM HOOK NÀY: Quản lý bộ đếm thời gian cho UI
  useEffect(() => {
    let interval;
    if (isWaitingForOffline) {
      setCountdown(30); // Reset về 30 giây khi bắt đầu chờ
      interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000); // Cứ 1000ms (1 giây) thì trừ 1
    } else {
      setCountdown(30); // Nếu hết chờ thì reset lại
    }

    // Dọn dẹp interval khi component unmount hoặc khi hết chờ
    return () => clearInterval(interval);
  }, [isWaitingForOffline]);

  // 2. HOOK ĐẾM NGƯỢC (Chỉ chạy khi có sự thay đổi về Lượt hoặc Mảng người chơi)
  useEffect(() => {
    // Chỉ Host mới có quyền đếm giờ và ép bỏ lượt
    if (!isHost || gameState !== 'PLAYING' || !currentTurnId) return;

    const currentPlayer = players.find(p => p.id === currentTurnId);

    // Nếu đến lượt một ông đang rớt mạng (Bất kể là ông dân thường hay Cựu Host)
    if (currentPlayer && currentPlayer.status === 'OFFLINE') {
      console.log(`⏳ [HOST] Đang đếm ngược 30s ép bỏ lượt cho ${currentPlayer.name}...`);

      const timer = setTimeout(() => {
        console.log(`❌ [HOST] Đã hết 30s! Ép ${currentPlayer.name} bỏ lượt.`);

        // 1. Tính toán Sổ đen mới
        const newPassedIds = Array.from(new Set([...(passedPlayerIds || []), currentTurnId]));
        let nextTurnId;
        let isRoundOver = false;

        // 2. Lọc bỏ Khán giả, tính luật Hết Vòng
        const activePlayers = players.filter(p => p.status !== 'SPECTATOR');

        if (newPassedIds.length >= activePlayers.length - 1) {
          nextTurnId = activePlayers.find(p => !newPassedIds.includes(p.id))?.id || activePlayers[0].id;
          isRoundOver = true;
        } else {
          nextTurnId = getNextTurnId(currentTurnId, activePlayers, newPassedIds);
        }

        // 3. Cập nhật State cục bộ
        const currentState = useGameStore.getState();
        currentState.updateGameState({
          passedPlayerIds: isRoundOver ? [] : newPassedIds,
          currentTurnId: nextTurnId,
          tableCards: isRoundOver ? [] : currentState.tableCards,
          // Cập nhật isMyTurn nhỡ đâu vòng xoay đúng lúc trúng lượt của Host mới
          isMyTurn: nextTurnId === userId
        });

        // 4. Bắn tín hiệu giả danh ông offline lên Server
        socket.emit('GAME_ACTION', {
          roomId,
          actionType: 'PASS_TURN',
          payload: { userId: currentTurnId }
        });

      }, 30000); // 30 giây

      // Nếu ổng vào lại hoặc có biến động -> Xóa timer
      return () => clearTimeout(timer);
    }
  }, [isHost, gameState, currentTurnId, players, passedPlayerIds, roomId, userId]);

  useEffect(() => {
    socket.connect();

    socket.on('connect', () => {
      setIsConnected(true);
      // LOGIC TỰ ĐỘNG RECONNECT
      if (roomId && userId) {
        console.log('🔄 Đang khôi phục kết nối vào phòng:', roomId);

        // Tạm thời hiển thị mình trên UI trong lúc chờ đồng bộ
        const me = { id: userId, name, avatar, isHost };
        updateGameState({ players: [me] });

        socket.emit('JOIN_ROOM', { roomId, user: me });

        // 1. Hét lên cho mọi người biết mình vừa chui vào lại (Quan trọng!)
        socket.emit('GAME_ACTION', {
          roomId,
          actionType: 'PLAYER_JOINED',
          payload: { user: me }
        });
      }
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('GAME_UPDATE', (data) => {
      const { actionType, payload } = data;
      const currentState = useGameStore.getState();

      // ==========================================
      // QUY HOẠCH LẠI: LUỒNG ĐỒNG BỘ DỮ LIỆU
      // ==========================================

      // 1. KHI CÓ NGƯỜI JOIN/RECONNECT
      if (actionType === 'PLAYER_JOINED' && currentState.isHost) {
        const newPlayer = payload.user;
        const currentPlayers = currentState.players;
        const existingPlayerIndex = currentPlayers.findIndex(p => p.id === newPlayer.id);

        let updatedPlayers = [...currentPlayers];

        if (existingPlayerIndex !== -1) {
          // TRƯỜNG HỢP 1: Người cũ kết nối lại (F5 hoặc rớt mạng vào lại)
          updatedPlayers[existingPlayerIndex].status = 'PLAYING';
          updatedPlayers[existingPlayerIndex].isHost = currentPlayers[existingPlayerIndex].isHost; // Giữ nguyên chức vụ
        } else {
          // TRƯỜNG HỢP 2: Người mới tinh vào phòng
          newPlayer.isHost = false;
          // Nếu ván đang chơi -> Làm khán giả. Nếu đang chờ -> Được chơi luôn.
          newPlayer.status = currentState.gameState === 'PLAYING' ? 'SPECTATOR' : 'PLAYING';
          updatedPlayers.push(newPlayer);
        }

        updateGameState({ players: updatedPlayers });

        // Host chốt sổ và phát lại toàn bộ Data
        if (currentState.isHost) {
          socket.emit('GAME_ACTION', {
            roomId, actionType: 'SYNC_STATE',
            payload: {
              targetId: 'ALL', players: updatedPlayers,
              gameState: currentState.gameState, tableCards: currentState.tableCards,
              currentTurnId: currentState.currentTurnId, passedPlayerIds: currentState.passedPlayerIds
            }
          });
        }
      }

      // 2. KHI CÓ NGƯỜI RỚT MẠNG
      if (actionType === 'PLAYER_DISCONNECTED') {
        const currentPlayers = currentState.players;
        const droppedUserId = payload.userId;
        let updatedPlayers = [...currentPlayers];

        if (currentState.gameState === 'PLAYING') {
          // NẾU ĐANG CHƠI: Không xóa, chỉ đánh dấu OFFLINE để giữ chỗ trên bàn
          const pIndex = updatedPlayers.findIndex(p => p.id === droppedUserId);
          if (pIndex !== -1) updatedPlayers[pIndex].status = 'OFFLINE';
        } else {
          // NẾU ĐANG CHỜ (LOBBY): Đuổi thẳng cổ luôn
          updatedPlayers = updatedPlayers.filter(p => p.id !== droppedUserId);
        }

        // Bầu Host mới nếu Host cũ rớt mạng
        const droppedPlayer = currentPlayers.find(p => p.id === droppedUserId);
        if (droppedPlayer?.isHost) {
          droppedPlayer.isHost = false;
          // 1. Ưu tiên 1: Tìm người ĐANG CHƠI (PLAYING) và không rớt mạng để trao quyền
          let newHost = updatedPlayers.find(p => p.status === 'PLAYING');

          // 2. Ưu tiên 2: Nếu tất cả người chơi đều rớt mạng, đành giao tạm cho Khán giả giữ phòng
          if (!newHost) {
            newHost = updatedPlayers.find(p => p.status === 'SPECTATOR');
          }

          if (newHost) {
            newHost.isHost = true;

            // Nếu mình được lên làm Vua -> Báo cáo thiên hạ
            if (newHost.id === userId) {
              currentState.setRoomInfo(roomId, true);
              socket.emit('GAME_ACTION', {
                roomId, actionType: 'SYNC_STATE',
                payload: {
                  targetId: 'ALL', players: updatedPlayers,
                  gameState: currentState.gameState, tableCards: currentState.tableCards,
                  currentTurnId: currentState.currentTurnId, passedPlayerIds: currentState.passedPlayerIds
                }
              });
            }
          }
        }
        updateGameState({ players: updatedPlayers });
      }

      // 3. NHẬN DỮ LIỆU ĐỒNG BỘ (Áp dụng cho mọi Client khi nhận được SYNC_STATE)
      if (actionType === 'SYNC_STATE' && (payload.targetId === userId || payload.targetId === 'ALL')) {
        const myLatestData = payload.players.find(p => p.id === userId);

        if (myLatestData && myLatestData.isHost !== currentState.isHost) {
          currentState.setRoomInfo(roomId, myLatestData.isHost);
        }

        updateGameState({
          players: payload.players || currentState.players,
          gameState: payload.gameState !== undefined ? payload.gameState : currentState.gameState,
          tableCards: payload.tableCards !== undefined ? payload.tableCards : currentState.tableCards,
          currentTurnId: payload.currentTurnId !== undefined ? payload.currentTurnId : currentState.currentTurnId,
          passedPlayerIds: payload.passedPlayerIds !== undefined ? payload.passedPlayerIds : currentState.passedPlayerIds,
          isMyTurn: payload.currentTurnId !== undefined ? payload.currentTurnId === userId : currentState.isMyTurn
        });
      }

      // 5. Nhận bài từ Host
      if (actionType === 'DEAL_CARDS') {
        const { cardsMap, firstTurnId } = payload; // LẤY firstTurnId TỪ PAYLOAD
        const myDealtCards = cardsMap[userId];

        if (myDealtCards) {
          // Xếp lại bài trên tay cho đẹp (từ bé đến lớn theo power)
          const sortedCards = myDealtCards.sort((a, b) => a.power - b.power);
          currentState.setMyCards(sortedCards);
        }

        // SỬA CHỖ NÀY: Chuyển trạng thái phòng sang ĐANG CHƠI + Set lượt
        updateGameState({
          gameState: 'PLAYING',
          currentTurnId: firstTurnId,
          isMyTurn: firstTurnId === userId,
          tableCards: [],
          passedPlayerIds: []
        });
      }

      // 6. Xử lý khi có người ĐÁNH BÀI
      if (actionType === 'PLAY_CARDS') {
        const { userId: playedUserId, cards, isWinningMove } = payload;

        if (isWinningMove) {
          // 1. Đóng băng bàn chơi, ghim người Thắng lại
          updateGameState({
            gameState: 'FINISHED',
            tableCards: cards,
            currentTurnId: null,
            isMyTurn: false,
            winnerId: playedUserId, // Lưu ID người về nhất
            roomCardsMap: {},       // Reset kho bài xèo
            // Hiển thị ngay Bảng điểm tạm thời (Mọi người đang "Đang lật bài...")
            gameResult: calculateGameResults(playedUserId, currentState.players, {})
          });

          // 2. MỖI NGƯỜI TỰ XOÈ BÀI CỦA MÌNH: Nếu mình thua, moi bài trên tay ném lên Server
          if (currentState.userId !== playedUserId && currentState.myCards.length > 0) {
            setTimeout(() => {
              // QUAN TRỌNG: Lấy State mới nhất ngay tại thời điểm 0.8s sau
              // Vì trong 0.8s chờ, có thể người khác đã xèo bài xong rồi
              const latestState = useGameStore.getState();
              const myLoserCards = latestState.myCards;

              // A. Tự nhét bài của mình vào kho Local
              const newCardsMap = { ...latestState.roomCardsMap, [latestState.userId]: myLoserCards };

              // B. Tự cập nhật Bảng điểm trên mặt mình ngay lập tức
              latestState.updateGameState({
                roomCardsMap: newCardsMap,
                gameResult: calculateGameResults(playedUserId, latestState.players, newCardsMap)
              });

              // C. Bắn bài lên Server cho thiên hạ cùng xem
              socket.emit('GAME_ACTION', {
                roomId,
                actionType: 'SHOW_CARDS',
                payload: { userId: latestState.userId, cards: myLoserCards }
              });
            }, 800);
          }
          return; // Cắt ngang, không đi tiếp logic đánh thường
        }

        const currentPlayers = currentState.players;
        const currentPassedIds = currentState.passedPlayerIds || [];

        const nextTurnId = getNextTurnId(playedUserId, currentPlayers, currentPassedIds);

        updateGameState({
          tableCards: cards,
          currentTurnId: nextTurnId,
          isMyTurn: nextTurnId === currentState.userId
        });
      }

      // 7. Xử lý khi có người BỎ LƯỢT
      if (actionType === 'PASS_TURN') {
        const { userId: passedUserId } = payload;
        const currentPlayers = currentState.players;

        // DÙNG SET ĐỂ LỌC TRÙNG: Chống lỗi Server gửi Echo lại chính mình làm x2 sổ đen
        const newPassedIds = Array.from(new Set([...(currentState.passedPlayerIds || []), passedUserId]));

        // NẾU TẤT CẢ ĐỀU BỎ LƯỢT TRỪ 1 NGƯỜI -> KẾT THÚC VÒNG
        if (newPassedIds.length >= currentPlayers.length - 1) {
          const winnerRoundId = currentPlayers.find(p => !newPassedIds.includes(p.id))?.id || currentPlayers[0].id;

          updateGameState({
            tableCards: [],
            passedPlayerIds: [],
            currentTurnId: winnerRoundId,
            isMyTurn: winnerRoundId === currentState.userId
          });

        } else {
          // CHƯA HẾT VÒNG -> CHUYỂN NGƯỜI TIẾP
          const nextTurnId = getNextTurnId(passedUserId, currentPlayers, newPassedIds);
          updateGameState({
            passedPlayerIds: newPassedIds,
            currentTurnId: nextTurnId,
            isMyTurn: nextTurnId === currentState.userId
          });
        }
      }

      // 7. THU THẬP BÀI XÈO (SHOW_CARDS) VÀ TÍNH ĐIỂM
      if (actionType === 'SHOW_CARDS') {
        const { userId: loserId, cards: loserCards } = payload;

        // Gom bài của người vừa xèo vào kho chung
        const newCardsMap = { ...currentState.roomCardsMap, [loserId]: loserCards };

        // GỌI HÀM LOGIC RA TÍNH TOÁN
        const newResults = calculateGameResults(currentState.winnerId, currentState.players, newCardsMap);

        // Cập nhật lại UI, bảng điểm sẽ nảy số Real-time
        updateGameState({
          roomCardsMap: newCardsMap,
          gameResult: newResults
        });
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('GAME_UPDATE');
    };
  }, [roomId, userId, name, avatar, updateGameState]);

  // Xử lý khi bấm nút Tạo Phòng
  const handleCreateRoom = (inputName, inputAvatar) => {
    const newRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    const userInfo = { id: useGameStore.getState().userId, name: inputName, avatar: inputAvatar, isHost: true };

    setRoomInfo(newRoomId, true);
    updateGameState({ players: [userInfo] }); // Host tự đưa mình vào mảng đầu tiên

    socket.emit('JOIN_ROOM', { roomId: newRoomId, user: userInfo });
  };

  // Xử lý khi bấm nút Vào Phòng
  const handleJoinRoom = (inputRoomId, inputName, inputAvatar) => {
    const userInfo = { id: useGameStore.getState().userId, name: inputName, avatar: inputAvatar, isHost: false };

    setRoomInfo(inputRoomId, false);

    socket.emit('JOIN_ROOM', { roomId: inputRoomId, user: userInfo });
    // Bắn tin nhắn cho Host biết có người mới để Host add vào mảng
    socket.emit('GAME_ACTION', {
      roomId: inputRoomId,
      actionType: 'PLAYER_JOINED',
      payload: { user: userInfo }
    });
  };

  const handleLeaveRoom = () => {
    // 1. Lấy thông tin hiện tại trước khi xóa
    const currentRoomId = useGameStore.getState().roomId;
    const currentUserId = useGameStore.getState().userId;

    // 2. Báo cho Server và anh em trong phòng biết mình chuồn đây
    socket.emit('LEAVE_ROOM', {
      roomId: currentRoomId,
      userId: currentUserId
    });

    // 3. Xóa data local để UI văng ra ngoài Sảnh
    useGameStore.getState().leaveRoom();
  };

  const handleDealCards = () => {
    const currentState = useGameStore.getState();
    const myId = currentState.userId;

    // === THÊM ĐOẠN DỌN DẸP PHÒNG NÀY VÀO ===
    // 1. Đuổi những người đang OFFLINE từ ván trước ra khỏi phòng
    let cleanPlayers = currentState.players.filter(p => p.status !== 'OFFLINE');
    // 2. Nâng cấp SPECTATOR (Khán giả) thành PLAYING
    cleanPlayers = cleanPlayers.map(p => ({ ...p, status: 'PLAYING' }));

    // Cập nhật lại danh sách sạch sẽ
    updateGameState({ players: cleanPlayers });
    const currentPlayers = cleanPlayers;
    // =======================================

    // 1. Sinh bộ bài 52 lá và xào lên
    let deck = shuffleDeck(createDeck());

    // 2. Chia cho mỗi người 10 lá
    const dealtCards = {};
    currentPlayers.forEach(player => {
      dealtCards[player.id] = deck.splice(0, 10);
    });

    // ==========================================
    // THÊM MỚI: TÌM ID NGƯỜI ĐI ĐẦU TIÊN (Cho Host đi trước)
    // ==========================================
    const hostPlayer = currentPlayers.find(p => p.isHost);
    const firstTurnId = hostPlayer ? hostPlayer.id : currentPlayers[0].id;

    // 3. OPTIMISTIC UPDATE: Tự xử lý phần của mình NGAY LẬP TỨC
    const myCardsRaw = dealtCards[myId];
    if (myCardsRaw) {
      const sortedCards = myCardsRaw.sort((a, b) => a.power - b.power);
      currentState.setMyCards(sortedCards);
    }

    // SỬA CHỖ NÀY: Set luôn currentTurnId và isMyTurn lúc chia bài
    currentState.updateGameState({
      gameState: 'PLAYING',
      currentTurnId: firstTurnId,
      isMyTurn: firstTurnId === myId,
      tableCards: [],         // Dọn sạch bàn nếu ván trước còn rác
      passedPlayerIds: []     // Xóa sổ đen những người đã bỏ lượt
    });

    // 4. Báo cho anh em trong phòng kèm theo firstTurnId
    socket.emit('GAME_ACTION', {
      roomId,
      actionType: 'DEAL_CARDS',
      payload: { cardsMap: dealtCards, firstTurnId } // <--- Gửi kèm cái này đi
    });
  };

  const handlePlayCards = () => {
    const currentState = useGameStore.getState();
    const { myCards, selectedCards, userId, players, passedPlayerIds } = currentState;

    if (selectedCards.length === 0) return;

    const playedCards = myCards.filter(card => selectedCards.includes(card.id));
    const remainingCards = myCards.filter(card => !selectedCards.includes(card.id));

    // Kiểm tra xem MÌNH có Về Nhất không?
    const isWinningMove = remainingCards.length === 0;

    const nextTurnId = getNextTurnId(userId, players, passedPlayerIds || []);

    // 1. Trừ bài trên tay lập tức
    currentState.setMyCards(remainingCards);

    // 2. OPTIMISTIC UPDATE: Tự xử lý State cho chính mình
    if (isWinningMove) {
      // TRƯỜNG HỢP MÌNH VỀ NHẤT: Tự đóng băng bàn, tự vinh danh mình
      currentState.updateGameState({
        gameState: 'FINISHED',
        tableCards: playedCards,
        currentTurnId: null,
        isMyTurn: false,
        winnerId: userId, // Mình là người thắng
        roomCardsMap: {}, // Dọn kho để chờ bọn thua xèo bài ném vào
        // Gọi hàm tính điểm: Cho mình lên đỉnh bảng, bọn kia tạm thời "Đang lật bài..."
        gameResult: calculateGameResults(userId, players, {})
      });
    } else {
      // TRƯỜNG HỢP ĐÁNH BÌNH THƯỜNG: Chuyển lượt
      currentState.updateGameState({
        tableCards: playedCards,
        currentTurnId: nextTurnId,
        isMyTurn: false
      });
    }

    // 3. Xóa bài đang chọn (bỏ viền xanh)
    currentState.clearSelectedCards();

    // 4. Bắn tín hiệu lên Server báo cho anh em biết
    socket.emit('GAME_ACTION', {
      roomId,
      actionType: 'PLAY_CARDS',
      payload: { userId, cards: playedCards, isWinningMove }
    });
  };

  const handlePassTurn = () => {
    const currentState = useGameStore.getState();
    const { userId, players, passedPlayerIds } = currentState;

    // Tự tống mình vào sổ đen bằng Set để không trùng lặp
    const newPassedIds = Array.from(new Set([...(passedPlayerIds || []), userId]));

    // Tự xử lý luật Hết Vòng ngay tại máy mình
    if (newPassedIds.length >= players.length - 1) {
      const winnerRoundId = players.find(p => !newPassedIds.includes(p.id))?.id || players[0].id;
      currentState.updateGameState({
        tableCards: [],
        passedPlayerIds: [],
        currentTurnId: winnerRoundId,
        isMyTurn: false // Mình vừa pass nên chắc chắn không phải là mình
      });
    } else {
      const nextTurnId = getNextTurnId(userId, players, newPassedIds);
      currentState.updateGameState({
        passedPlayerIds: newPassedIds,
        currentTurnId: nextTurnId,
        isMyTurn: false
      });
    }
    currentState.clearSelectedCards();

    socket.emit('GAME_ACTION', {
      roomId,
      actionType: 'PASS_TURN',
      payload: { userId }
    });
  };

  // Nếu chưa có phòng -> Hiện Lobby
  if (!roomId) {
    return <Lobby onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} />;
  }

  // Đã vào phòng
  // client/src/App.jsx (Đoạn return)
  // client/src/App.jsx (Đoạn return)
  return (
    // THAY ĐỔI 1: Bỏ p-2, thêm padding an toàn cho tai thỏ (pt-[env(safe-area-inset-top)])
    <div className="flex flex-col items-center justify-between h-screen w-screen bg-slate-900 text-white overflow-hidden select-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] relative">

      {/* THÊM MÀN CHẮN BÁO MẤT MẠNG */}
      {!isConnected && (
        <div className="absolute inset-0 z-[999] bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <h2 className="text-xl md:text-2xl font-black text-yellow-400 animate-pulse">Đang kết nối lại...</h2>
          <p className="text-slate-300 mt-2 text-sm">Vui lòng kiểm tra lại Internet của bạn</p>
        </div>
      )}
      {/* THAY ĐỔI 2: HEADER LƠ LỬNG (absolute, trong suốt, nằm đè lên trên cùng) */}
      <div className="absolute top-[env(safe-area-inset-top)] left-0 w-full flex justify-between items-start px-2 py-2 md:px-4 md:py-4 z-50 pointer-events-none">

        {/* Khối Mã Phòng (Góc trái trên) */}
        <div className="bg-slate-900/50 backdrop-blur-sm px-3 py-1.5 md:px-4 md:py-2 rounded-lg border border-slate-700/50 flex items-center gap-2 pointer-events-auto shadow-lg">
          <span className="text-yellow-400 font-bold text-xs md:text-lg tracking-widest">
            {roomId}
          </span>
          <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] ${isConnected ? 'bg-green-500 text-green-500' : 'bg-red-500 text-red-500'}`}></div>
        </div>

        {/* Khối Nút Thoát (Góc phải trên) */}
        <button
          onClick={handleLeaveRoom}
          className="pointer-events-auto px-3 py-1.5 md:px-4 md:py-2 bg-red-500/80 hover:bg-red-500 rounded-lg font-bold text-[10px] md:text-sm shadow-lg transition active:scale-95">
          Thoát
        </button>

      </div>

      {/* KHU VỰC BÀN CHƠI (Giờ đã chiếm trọn không gian phía trên) */}
      {/* THAY ĐỔI 3: Thêm pt-10 md:pt-16 để đẩy cái bàn xích xuống 1 xíu, né cái nút Thoát ra */}
      <div className="w-full flex-1 flex flex-col justify-center relative min-h-0 px-2 md:px-8 pt-10 md:pt-16">
        <GameTable onDealCards={handleDealCards} />
      </div>

      {/* KHU VỰC BÀI CỦA MÌNH (Mobile: 40%, PC/Tablet: 30%) */}
      <div className="w-full h-[40vh] md:h-[30vh] min-h-[220px] md:min-h-[200px] max-h-[400px] md:max-h-[300px] shrink-0 border-t border-slate-700/50 flex flex-col items-center justify-end relative z-50 bg-slate-800/30 backdrop-blur-md">

        <HandCards onPlayCards={handlePlayCards} onPassTurn={handlePassTurn} />

      </div>

      {/* ========================================== */}
      {/* MÀN CHẮN CHỜ NGƯỜI CHƠI RECONNECT */}
      {/* ========================================== */}
      {isWaitingForOffline && (
        <div className="absolute inset-0 z-[200] bg-slate-900/80 backdrop-blur-md flex flex-col items-center justify-center pointer-events-auto transition-all duration-300">
          <div className="w-16 h-16 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-6 shadow-[0_0_15px_rgba(239,68,68,0.5)]"></div>

          <h2 className="text-2xl md:text-4xl font-black text-red-500 animate-pulse text-center px-4 drop-shadow-lg uppercase tracking-wider">
            Đang chờ {turnPlayer?.name}...
          </h2>

          <div className="mt-6 flex flex-col items-center">
            {/* HIỂN THỊ SỐ ĐẾM NGƯỢC SIÊU TO KHỔNG LỒ */}
            <span className={`text-6xl md:text-8xl font-black drop-shadow-[0_0_20px_currentColor] transition-colors duration-300 ${countdown <= 5 ? 'text-red-500 animate-bounce' : 'text-yellow-400'}`}>
              {countdown}
            </span>
            <p className="text-slate-300 font-bold text-sm md:text-base text-center mt-2 uppercase tracking-widest">
              Hệ thống tự động bỏ lượt
            </p>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* MÀN HÌNH TỔNG KẾT VÁN ĐẤU (SCOREBOARD) */}
      {/* ========================================== */}
      {gameState === 'FINISHED' && gameResult && (
        <div className="absolute inset-0 z-[500] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4 transition-all duration-500">
          <div className="bg-slate-800 border-4 border-slate-600 rounded-3xl w-full max-w-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)]">

            <div className="bg-gradient-to-b from-yellow-600 to-yellow-800 p-4 text-center border-b-4 border-slate-900 shadow-inner">
              <h2 className="text-3xl md:text-5xl font-black text-white drop-shadow-lg uppercase tracking-widest">Kết Thúc Ván</h2>
            </div>

            <div className="p-4 md:p-6 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
              {gameResult.map((result, idx) => (
                <div key={result.id} className={`flex flex-col gap-2 p-3 md:p-4 rounded-xl border-2 ${result.role === 'WINNER' ? 'bg-yellow-500/10 border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.2)]' : 'bg-slate-900/50 border-slate-700'}`}>

                  {/* Dòng 1: Thông tin Avatar, Tên, Điểm số */}
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <img src={result.avatar} alt="avatar" className="w-12 h-12 md:w-16 md:h-16 rounded-full object-cover border-2 border-slate-500" />
                      {result.role === 'WINNER' && <span className="absolute -top-3 -right-2 text-2xl drop-shadow-md">👑</span>}
                    </div>

                    <div className="flex-1">
                      <h3 className={`font-black text-base md:text-xl truncate ${result.role === 'WINNER' ? 'text-yellow-400' : 'text-slate-200'}`}>{result.name}</h3>
                      <p className="text-xs md:text-sm text-slate-400 font-bold">{result.detail}</p>
                    </div>

                    <div className={`text-2xl md:text-4xl font-black ${result.role === 'WINNER' ? 'text-green-500 drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]'}`}>
                      {result.score}
                    </div>
                  </div>

                  {/* Dòng 2: MÀN "XÈO BÀI" CỦA KẺ THUA CUỘC */}
                  {result.remainingCards && result.remainingCards.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-700/50 flex flex-wrap gap-1 md:gap-2">
                      {/* Render từng lá bài còn kẹp trên tay (thu nhỏ 50% cho đỡ chiếm diện tích) */}
                      {result.remainingCards.map((card, i) => (
                        <div key={card.id} className="w-8 md:w-10 scale-90 origin-top-left">
                          <Card card={card} />
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              ))}
            </div>

            {/* Chỉ Host mới có quyền bấm Ván Mới */}
            {isHost && (
              <div className="p-4 bg-slate-900 border-t-2 border-slate-700 flex justify-center">
                <button onClick={handleDealCards} className="px-10 py-4 bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-black text-xl rounded-full shadow-xl transition active:scale-95 uppercase tracking-widest">
                  🎲 Chơi Ván Mới
                </button>
              </div>
            )}
            {!isHost && (
              <div className="p-4 bg-slate-900 border-t-2 border-slate-700 text-center">
                <p className="text-slate-400 font-bold animate-pulse">Đang chờ Chủ phòng chia bài...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
export default App;