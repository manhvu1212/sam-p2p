import { useEffect, useState, useRef } from 'react';
import { socket } from './socket';
import Lobby from './components/Lobby';
import GameTable from './components/GameTable';
import HandCards from './components/HandCards';
import Card from './components/Card';
import { useGameStore } from './store/useGameStore';
import { createDeck, shuffleDeck, getNextTurnId, calculateGameResults } from './utils/gameLogic';

function App() {
  const hasHydrated = useGameStore.persist.hasHydrated();

  const userId = useGameStore(s => s.userId);
  const name = useGameStore(s => s.name);
  const avatar = useGameStore(s => s.avatar);
  const roomId = useGameStore(s => s.roomId);
  const isHost = useGameStore(s => s.isHost);
  const isReady = useGameStore(s => s.isReady);
  const players = useGameStore(s => s.players);
  const currentTurnId = useGameStore(s => s.currentTurnId);
  const gameState = useGameStore(s => s.gameState);
  const gameResult = useGameStore(s => s.gameResult);

  const [isConnected, setIsConnected] = useState(false);

  // TÍNH TOÁN: Tìm xem người đang giữ lượt có phải đang OFFLINE không?
  const turnPlayer = players.find(p => p.id === currentTurnId);
  const isWaitingForOffline = turnPlayer?.status === 'OFFLINE';
  const [countdown, setCountdown] = useState(30);

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
    if (!isHost || gameState !== 'PLAYING' || !turnPlayer) return;

    // Nếu đến lượt một ông đang rớt mạng (Bất kể là ông dân thường hay Cựu Host)
    if (turnPlayer.status === 'OFFLINE') {
      const timer = setTimeout(() => {
        passTurn(turnPlayer.id)
      }, 30000); // 30 giây
      // Nếu ổng vào lại hoặc có biến động -> Xóa timer
      return () => clearTimeout(timer);
    }
  }, [turnPlayer]);

  useEffect(() => {
    socket.connect();
    const onConnect = () => {
      setIsConnected(true);
    };
    const onDisconnect = () => {
      setIsConnected(false);
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const hasJoinedRef = useRef(false);
  useEffect(() => {
    if (!hasHydrated) return;
    if (!isConnected) return;
    if (!roomId || !userId) return;
    if (hasJoinedRef.current) return;
    hasJoinedRef.current = true;

    if (players.length > 1) {
      useGameStore.setState({ isHost: false });
      const me = { id: userId, name, avatar, isHost: false, isReady };
      socket.emit('JOIN_ROOM', { roomId, user: me });
    }
  }, [hasHydrated, isConnected, roomId, userId]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!userId) return;

    socket.on('PLAYER_JOINED', (newPlayer) => {
      newPlayer.isHost = false;
      // Nếu ván đang chơi mà người này tham gia vào thêm không phải người cũ quay lại -> Làm khán giả. Nếu đang chờ -> Được chơi luôn.
      newPlayer.status = useGameStore.getState().gameState === 'PLAYING' && !useGameStore.getState().hasPlayer(newPlayer.id) ? 'SPECTATOR' : 'PLAYER';
      useGameStore.getState().addOrUpdatePlayer(newPlayer)

      // Host gửi data hiện tại cho người mới Join vào
      if (useGameStore.getState().isHost) {
        const currentState = useGameStore.getState();
        socket.emit('GAME_ACTION', {
          roomId: currentState.roomId,
          actionType: 'SYNC_STATE',
          payload: {
            targetId: newPlayer.id,

            gameState: currentState.gameState,
            players: currentState.players,
            tableCards: currentState.tableCards,
            currentTurnId: currentState.currentTurnId,
            winnerId: currentState.winnerId,
            gameResult: currentState.gameResult,
            roomCardsMap: currentState.roomCardsMap,
          }
        });
      }
    })

    socket.on('PLAYER_LEFT', (droppedUserId) => {
      const currentPlayers = useGameStore.getState().players
      const droppedPlayer = currentPlayers.find(p => p.id === droppedUserId);
      if (droppedPlayer?.isHost) {
        // 1. Ưu tiên 1: Tìm người ĐANG CHƠI (PLAYER) và không rớt mạng để trao quyền
        let newHost = currentPlayers.find(p => p.id !== droppedUserId && p.status === 'PLAYER');
        // 2. Ưu tiên 2: Nếu tất cả người chơi đều rớt mạng, đành giao tạm cho Khán giả giữ phòng
        if (!newHost) {
          newHost = currentPlayers.find(p => p.id !== droppedUserId && p.status === 'SPECTATOR');
        }

        if (newHost) {
          useGameStore.getState().updatePlayer(droppedUserId, { isHost: false })
          useGameStore.getState().updatePlayer(newHost.id, { isHost: true })
          useGameStore.getState().setRoomInfo(useGameStore.getState().roomId, newHost.id === useGameStore.getState().userId);
        }
      }

      if (useGameStore.getState().gameState === 'WAITING' || droppedPlayer?.status === "SPECTATOR") {
        // NẾU ĐANG CHỜ: Đuổi thẳng cổ luôn
        useGameStore.getState().removePlayer(droppedUserId)
      } else {
        // NẾU ĐANG CHƠI: Không xóa, chỉ đánh dấu OFFLINE để giữ chỗ trên bàn
        useGameStore.getState().updatePlayer(droppedUserId, { status: "OFFLINE" })
      }
    })

    socket.on('GAME_UPDATE', (data) => {
      const { actionType, payload } = data;

      // 3. NHẬN DỮ LIỆU ĐỒNG BỘ (Áp dụng cho mọi Client khi nhận được SYNC_STATE)
      if (actionType === 'SYNC_STATE' && (payload.targetId === useGameStore.getState().userId || payload.targetId === 'ALL')) {
        const currentState = useGameStore.getState();
        useGameStore.setState({
          gameState: payload.gameState !== undefined ? payload.gameState : currentState.gameState,
          players: payload.players !== undefined ? payload.players : currentState.players,
          tableCards: payload.tableCards !== undefined ? payload.tableCards : currentState.tableCards,
          currentTurnId: payload.currentTurnId !== undefined ? payload.currentTurnId : currentState.currentTurnId,
          winnerId: payload.winnerId !== undefined ? payload.winnerId : currentState.winnerId,
          gameResult: payload.gameResult !== undefined ? payload.gameResult : currentState.gameResult,
          roomCardsMap: payload.roomCardsMap !== undefined ? payload.roomCardsMap : currentState.roomCardsMap,
        });
      }

      // 4. Ready to play. Khi tất cả đã ready. Host sẽ tự động chia bài
      if (actionType === 'READY_TO_PLAY') {
        const { userId: readyPlayerId } = payload;
        useGameStore.getState().updatePlayer(readyPlayerId, { isReady: true })

        if (useGameStore.getState().isHost) {
          let gameReady = useGameStore.getState().players.every(p => p.status === 'PLAYER' && p.isReady)
          if (gameReady) {
            handleDealCards()
          }
        }
      }

      // 5. Nhận bài từ Host
      if (actionType === 'DEAL_CARDS') {
        const { cardsMap, currentTurnId } = payload;
        const myDealtCards = cardsMap[useGameStore.getState().userId];

        if (myDealtCards) {
          // Xếp lại bài trên tay cho đẹp (từ bé đến lớn theo power)
          const sortedCards = myDealtCards.sort((a, b) => a.power - b.power);
          useGameStore.getState().setMyCards(sortedCards);

          useGameStore.setState({
            gameState: 'PLAYING',
            currentTurnId: currentTurnId,
            winnerId: null
          });
        }
      }

      // 6. Xử lý khi có người ĐÁNH BÀI
      if (actionType === 'PLAY_CARDS') {
        const { cards, nextTurnId } = payload;
        useGameStore.setState({
          tableCards: cards,
          currentTurnId: nextTurnId
        });
      }

      // 7. Xử lý khi có người BỎ LƯỢT
      if (actionType === 'PASS_TURN') {
        const { passUserId } = payload;
        useGameStore.getState().updatePlayer(passUserId, { isPassTurn: true })

        const activePlayers = useGameStore.getState().players.filter(p => p.status === 'PLAYER');

        // NẾU TẤT CẢ ĐỀU BỎ LƯỢT TRỪ 1 NGƯỜI -> KẾT THÚC VÒNG
        if (activePlayers.filter(p => !p.isPassTurn).length <= 1) {
          console.log(JSON.stringify(useGameStore.getState().players))
          const winnerRoundId = activePlayers.find(p => !p.isPassTurn)?.id || activePlayers[0].id;
          useGameStore.getState().updatePlayers([], { isPassTurn: false })
          console.log(JSON.stringify(useGameStore.getState().players))
          useGameStore.setState({
            tableCards: [],
            currentTurnId: winnerRoundId
          });
        } else {
          // CHƯA HẾT VÒNG -> CHUYỂN NGƯỜI TIẾP
          const nextTurnId = getNextTurnId(passUserId, activePlayers);
          useGameStore.setState({ currentTurnId: nextTurnId });
        }
      }

      if (actionType === 'WIN') {
        const { userId: winnerId } = payload;
        useGameStore.setState({
          gameState: 'FINISHED',
          winnerId: winnerId
        });

        // 2. MỖI NGƯỜI TỰ XOÈ BÀI CỦA MÌNH:
        const scorePlayers = useGameStore.getState().players.filter(p => p.status !== 'SPECTATOR');
        useGameStore.getState().addOrUpdateRoomCards(useGameStore.getState().userId, useGameStore.getState().myCards)
        useGameStore.setState({ gameResult: calculateGameResults(winnerId, scorePlayers, useGameStore.getState().roomCardsMap) });

        // C. Bắn bài lên Server cho thiên hạ cùng xem
        socket.emit('GAME_ACTION', {
          roomId: useGameStore.getState().roomId,
          actionType: 'SHOW_CARDS',
          payload: { userId: useGameStore.getState().userId, cards: useGameStore.getState().myCards }
        });
      }

      // 7. THU THẬP BÀI XÒE (SHOW_CARDS) VÀ TÍNH ĐIỂM
      if (actionType === 'SHOW_CARDS') {
        const { userId: loserId, cards: loserCards } = payload;
        // Gom bài của người vừa xèo vào kho chung
        useGameStore.getState().addOrUpdateRoomCards(loserId, loserCards)
        // GỌI HÀM LOGIC RA TÍNH TOÁN
        const scorePlayers = useGameStore.getState().players.filter(p => p.status !== 'SPECTATOR');
        useGameStore.setState({ gameResult: calculateGameResults(useGameStore.getState().winnerId, scorePlayers, useGameStore.getState().roomCardsMap) });
      }
    });

    return () => socket.removeAllListeners();
  }, [hasHydrated, userId]);

  // Xử lý khi bấm nút Tạo Phòng
  const handleCreateRoom = (inputName, inputAvatar) => {
    const newRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    useGameStore.setState({ roomId: newRoomId, isHost: true, isReady: true })
    const userInfo = { id: useGameStore.getState().userId, name: inputName, avatar: inputAvatar, status: "PLAYER", isHost: true, isReady: true, isPassTurn: false };
    useGameStore.getState().addOrUpdatePlayer(userInfo);
    socket.emit('JOIN_ROOM', { roomId: newRoomId, user: userInfo });
  };

  // Xử lý khi bấm nút Vào Phòng
  const handleJoinRoom = (inputRoomId, inputName, inputAvatar) => {
    useGameStore.setState({ roomId: inputRoomId, isHost: false, isReady: true })
    const userInfo = { id: useGameStore.getState().userId, name: inputName, avatar: inputAvatar, isHost: false, isReady: true, isPassTurn: false };
    useGameStore.getState().addOrUpdatePlayer(userInfo);
    socket.emit('JOIN_ROOM', { roomId: inputRoomId, user: userInfo });
  };

  const handleLeaveRoom = () => {
    const currentState = useGameStore.getState()
    // 2. Báo cho Server và anh em trong phòng biết mình chuồn đây
    socket.emit('LEAVE_ROOM', {
      roomId: currentState.roomId,
      userId: currentState.userId
    });
    // 3. Xóa data local để UI văng ra ngoài Sảnh
    currentState.leaveRoom();
  };

  const handleReadyToPlay = () => {
    if (gameState === "PLAYING") return
    // === THÊM ĐOẠN DỌN DẸP PHÒNG NÀY VÀO ===
    // 1. Đuổi những người đang OFFLINE từ ván trước ra khỏi phòng
    let cleanPlayerIds = players.filter(p => p.status !== 'OFFLINE').map(p => p.id);
    useGameStore.getState().removePlayers(cleanPlayerIds)
    // 2. Nâng cấp SPECTATOR (Khán giả) thành PLAYER
    useGameStore.getState().updatePlayers([], { status: 'PLAYER' })

    useGameStore.setState({
      isReady: true,
      gameState: 'WAITING',
      tableCards: [],
      currentTurnId: null,
      gameResult: null,
      roomCardsMap: {}
    });
    useGameStore.getState().updatePlayer(useGameStore.getState().userId, { isReady: true })
    socket.emit('GAME_ACTION', {
      roomId,
      actionType: 'READY_TO_PLAY',
      payload: { userId: useGameStore.getState().userId }
    });

    if (useGameStore.getState().isHost) {
      let gameReady = useGameStore.getState().players.every(p => p.isReady)
      if (gameReady) {
        handleDealCards()
      }
    }
  }

  const handleDealCards = () => {
    const currentState = useGameStore.getState();
    if (!currentState.isHost) return

    // =======================================

    // 1. Sinh bộ bài 52 lá và xào lên
    let deck = shuffleDeck(createDeck());

    // 2. Chia cho mỗi người 10 lá
    const dealtCards = {};
    currentState.players.forEach(player => {
      dealtCards[player.id] = deck.splice(0, 10);
    });

    // ==========================================
    // THÊM MỚI: TÌM ID NGƯỜI ĐI ĐẦU TIÊN (Cho Host đi trước)
    // ==========================================
    const winnerPlayer = currentState.players.find(p => p.id === currentState.winnerId);
    const firstTurnId = winnerPlayer ? winnerPlayer.id : useGameStore.getState().userId

    // 3. OPTIMISTIC UPDATE: Tự xử lý phần của mình NGAY LẬP TỨC
    const myCardsRaw = dealtCards[useGameStore.getState().userId];
    if (myCardsRaw) {
      const sortedCards = myCardsRaw.sort((a, b) => a.power - b.power);
      currentState.setMyCards(sortedCards);
    }

    useGameStore.setState({
      gameState: 'PLAYING',
      currentTurnId: firstTurnId,
      winnerId: null
    });

    // 4. Báo cho anh em trong phòng kèm theo firstTurnId
    socket.emit('GAME_ACTION', {
      roomId,
      actionType: 'DEAL_CARDS',
      payload: { cardsMap: dealtCards, currentTurnId: firstTurnId }
    });
  };

  const handlePlayCards = () => {
    const currentState = useGameStore.getState();
    const { userId, myCards, selectedCards, players } = currentState;

    if (selectedCards.length === 0) return;

    const playedCards = myCards.filter(card => selectedCards.includes(card.id));
    const remainingCards = myCards.filter(card => !selectedCards.includes(card.id));

    // Kiểm tra xem MÌNH có Về Nhất không?
    const isWinningMove = remainingCards.length === 0;

    const activePlayers = players.filter(p => p.status === 'PLAYER');
    const nextTurnId = isWinningMove ? null : getNextTurnId(userId, activePlayers);

    // 1. Trừ bài trên tay lập tức
    currentState.setMyCards(remainingCards);
    useGameStore.setState({
      tableCards: playedCards,
      currentTurnId: nextTurnId
    });
    currentState.clearSelectedCards();
    // 4. Bắn tín hiệu lên Server báo cho anh em biết
    socket.emit('GAME_ACTION', {
      roomId,
      actionType: 'PLAY_CARDS',
      payload: { userId, cards: playedCards, nextTurnId }
    });

    // 2. OPTIMISTIC UPDATE: Tự xử lý State cho chính mình
    if (isWinningMove) {
      const scorePlayers = players.filter(p => p.status !== 'SPECTATOR');
      useGameStore.setState({
        gameState: 'FINISHED',
        winnerId: userId,
        roomCardsMap: {},
        gameResult: calculateGameResults(userId, scorePlayers, {})
      });
      socket.emit('GAME_ACTION', {
        roomId,
        actionType: 'WIN',
        payload: { userId }
      });
    }
  };

  const handlePassTurn = () => {
    passTurn(useGameStore.getState().userId)
  };

  const passTurn = (passUserId) => {
    useGameStore.getState().updatePlayer(passUserId, { isPassTurn: true })
    useGameStore.getState().clearSelectedCards();

    const activePlayers = useGameStore.getState().players.filter(p => p.status === 'PLAYER');

    // NẾU TẤT CẢ ĐỀU BỎ LƯỢT TRỪ 1 NGƯỜI -> KẾT THÚC VÒNG
    if (activePlayers.filter(p => !p.isPassTurn).length <= 1) {
      const winnerRoundId = activePlayers.find(p => !p.isPassTurn)?.id || activePlayers[0].id;
      useGameStore.getState().updatePlayers([], { isPassTurn: false })
      useGameStore.setState({
        tableCards: [],
        currentTurnId: winnerRoundId
      });
    } else {
      // CHƯA HẾT VÒNG -> CHUYỂN NGƯỜI TIẾP
      const nextTurnId = getNextTurnId(passUserId, activePlayers);
      useGameStore.setState({ currentTurnId: nextTurnId });
    }

    socket.emit('GAME_ACTION', {
      roomId,
      actionType: 'PASS_TURN',
      payload: { passUserId }
    });
  }

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
          <div className="bg-slate-800 border-4 border-slate-600 rounded-3xl w-full max-w-5xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)]">

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
                        <Card key={card.id} card={card} className={`w-10 md:w-15`} simple={true} />
                      ))}
                    </div>
                  )}

                </div>
              ))}
            </div>

            <div className="p-4 bg-slate-900 border-t-2 border-slate-700 flex justify-center">
              <button onClick={handleReadyToPlay} className="px-10 py-4 bg-yellow-500 hover:bg-yellow-400 text-slate-900 font-black text-xl rounded-full shadow-xl transition active:scale-95 uppercase tracking-widest">
                🎲 Chơi Ván Mới
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default App;