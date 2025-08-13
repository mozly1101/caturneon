// Chess Neon — simple chess (mobile-friendly) with basic rules + optional random bot
// Features:
// - Tap piece to see legal moves, tap target to move
// - Legal moves include: normal moves, captures, pawn double-step, promotions to queen
// - No en passant, no castling, no draw rules
// - Cannot leave your own king in check (basic check validation)
// - Optional random-move bot for Black

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const yearEl = document.getElementById('year');
yearEl.textContent = new Date().getFullYear();
const resetBtn = document.getElementById('resetBtn');
const botBtn = document.getElementById('botBtn');

// Piece Unicode
const PIECE_UNI = {
  wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
  bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟︎',
};

// Initial setup (FEN-like array)
let start = [
  ['bR','bN','bB','bQ','bK','bB','bN','bR'],
  ['bP','bP','bP','bP','bP','bP','bP','bP'],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  ['wP','wP','wP','wP','wP','wP','wP','wP'],
  ['wR','wN','wB','wQ','wK','wB','wN','wR'],
];

let state = {
  board: JSON.parse(JSON.stringify(start)),
  turn: 'w', // 'w' or 'b'
  selected: null, // {r,c}
  movesCache: null,
  vsBot: false,
};

function inBounds(r,c){ return r>=0 && r<8 && c>=0 && c<8; }
function cloneBoard(b){ return b.map(row=>row.slice()); }
function other(color){ return color==='w'?'b':'w'; }

function render(){
  boardEl.innerHTML='';
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const idx = r*8+c;
      const sq = document.createElement('button');
      sq.className = 'sq ' + (((r+c)%2===0)?'light':'dark');
      sq.setAttribute('data-r', r);
      sq.setAttribute('data-c', c);
      sq.setAttribute('aria-label', `baris ${r+1}, kolom ${c+1}`);
      const piece = state.board[r][c];
      if(piece){
        sq.textContent = PIECE_UNI[piece];
      } else {
        sq.textContent = '';
      }
      boardEl.appendChild(sq);
    }
  }
  highlight();
  statusEl.textContent = `Giliran: ${state.turn==='w' ? 'Putih' : 'Hitam'}` + (state.vsBot && state.turn==='b' ? ' (Bot)' : '');
}

function isWhite(p){ return p && p[0]==='w'; }
function isBlack(p){ return p && p[0]==='b'; }
function colorOf(p){ return p ? p[0] : null; }

function movesForPiece(board, r, c){
  const p = board[r][c];
  if(!p) return [];
  const color = colorOf(p);
  const dir = color==='w' ? -1 : 1; // pawns move up for white (towards r=0)
  const moves = [];

  const push = (nr, nc)=>{
    if(!inBounds(nr,nc)) return;
    const t = board[nr][nc];
    if(!t) moves.push({r:nr,c:nc});
  };
  const capture = (nr, nc)=>{
    if(!inBounds(nr,nc)) return;
    const t = board[nr][nc];
    if(t && colorOf(t)!==color) moves.push({r:nr,c:nc});
  };

  switch(p.slice(1)){
    case 'P': {
      // forward
      const fr = r+dir;
      if(inBounds(fr,c) && !board[fr][c]){
        moves.push({r:fr,c:c});
        // double from start
        const startRow = color==='w'?6:1;
        const fr2 = r+2*dir;
        if(r===startRow && !board[fr2][c]) moves.push({r:fr2,c:c});
      }
      // captures
      capture(r+dir, c-1);
      capture(r+dir, c+1);
      break;
    }
    case 'N': {
      const deltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      for(const [dr,dc] of deltas){
        const nr=r+dr,nc=c+dc;
        if(!inBounds(nr,nc)) continue;
        const t = board[nr][nc];
        if(!t || colorOf(t)!==color) moves.push({r:nr,c:nc});
      }
      break;
    }
    case 'B': slideDirs(board, r,c, [[-1,-1],[-1,1],[1,-1],[1,1]], color, moves); break;
    case 'R': slideDirs(board, r,c, [[-1,0],[1,0],[0,-1],[0,1]], color, moves); break;
    case 'Q': slideDirs(board, r,c, [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]], color, moves); break;
    case 'K': {
      const deltas = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
      for(const [dr,dc] of deltas){
        const nr=r+dr,nc=c+dc;
        if(!inBounds(nr,nc)) continue;
        const t = board[nr][nc];
        if(!t || colorOf(t)!==color) moves.push({r:nr,c:nc});
      }
      break;
    }
  }
  // Filter: cannot land on own piece
  return moves;
}

function slideDirs(board, r,c, dirs, color, acc){
  for(const [dr,dc] of dirs){
    let nr=r+dr, nc=c+dc;
    while(inBounds(nr,nc)){
      const t = board[nr][nc];
      if(!t){
        acc.push({r:nr,c:nc});
      } else {
        if(colorOf(t)!==color) acc.push({r:nr,c:nc});
        break;
      }
      nr+=dr; nc+=dc;
    }
  }
}

// Find king position
function findKing(board, color){
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    if(board[r][c]===color+'K') return {r,c};
  }
  return null;
}

// Is square attacked by color
function squareAttacked(board, r,c, byColor){
  // Generate pseudo moves for all pieces of byColor and see if any hits (r,c)
  for(let i=0;i<8;i++) for(let j=0;j<8;j++){
    const p = board[i][j];
    if(!p || colorOf(p)!==byColor) continue;
    const mv = movesForPiece(board, i, j);
    // Special case: pawns attack diagonally only
    if(p[1]==='P'){
      const dir = byColor==='w' ? -1 : 1;
      const attacks = [[i+dir, j-1],[i+dir, j+1]];
      for(const [ar,ac] of attacks){
        if(ar===r && ac===c) return true;
      }
      continue;
    }
    for(const m of mv){
      if(m.r===r && m.c===c) return true;
    }
  }
  return false;
}

// Make move with basic legality (no self-check)
function legalMoves(board, fromR, fromC){
  const p = board[fromR][fromC];
  if(!p) return [];
  const color = colorOf(p);
  const pseudo = movesForPiece(board, fromR, fromC);
  // Filter moves that leave own king in check
  const res = [];
  for(const m of pseudo){
    const nb = cloneBoard(board);
    nb[m.r][m.c] = nb[fromR][fromC];
    nb[fromR][fromC] = null;
    // Pawn promotion to Queen if reaches last rank
    if(nb[m.r][m.c][1]==='P' && (m.r===0 || m.r===7)){
      nb[m.r][m.c] = color + 'Q';
    }
    const king = findKing(nb, color);
    if(!king || squareAttacked(nb, king.r, king.c, other(color))) continue; // illegal
    res.push(m);
  }
  return res;
}

function allMoves(board, color){
  const out = [];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p = board[r][c];
    if(!p || colorOf(p)!==color) continue;
    const ms = legalMoves(board, r,c);
    for(const m of ms) out.push({from:{r,c}, to:m});
  }
  return out;
}

function selectSquare(r,c){
  const piece = state.board[r][c];
  if(!piece) { state.selected = null; state.movesCache = null; render(); return; }
  if(colorOf(piece)!==state.turn) return;
  state.selected = {r,c};
  state.movesCache = legalMoves(state.board, r,c);
  render();
}

function tryMove(toR, toC){
  const sel = state.selected;
  if(!sel) return;
  const legal = state.movesCache || legalMoves(state.board, sel.r, sel.c);
  if(!legal.some(m => m.r===toR && m.c===toC)) return;
  const b = state.board;
  const color = state.turn;
  // move
  b[toR][toC] = b[sel.r][sel.c];
  b[sel.r][sel.c] = null;
  // promotion
  if(b[toR][toC][1]==='P' && (toR===0 || toR===7)){
    b[toR][toC] = color + 'Q';
  }
  state.selected = null;
  state.movesCache = null;
  // switch turn
  state.turn = other(state.turn);
  render();
  // Bot move if enabled
  if(state.vsBot && state.turn==='b'){
    setTimeout(botMove, 300);
  }
}

function highlight(){
  // selected piece highlight + possible moves
  const nodes = boardEl.querySelectorAll('.sq');
  nodes.forEach(n => n.classList.remove('highlight','move'));
  if(!state.selected) return;
  const idxSel = state.selected.r*8 + state.selected.c;
  nodes[idxSel].classList.add('highlight');
  const ms = state.movesCache || [];
  for(const m of ms){
    const idx = m.r*8 + m.c;
    nodes[idx].classList.add('move');
  }
}

function onSquareClick(e){
  const r = +e.currentTarget.getAttribute('data-r');
  const c = +e.currentTarget.getAttribute('data-c');
  if(state.selected && (r!==state.selected.r || c!==state.selected.c)){
    // attempt to move
    tryMove(r,c);
  } else {
    selectSquare(r,c);
  }
}

function bindEvents(){
  boardEl.querySelectorAll('.sq').forEach(sq => {
    sq.addEventListener('click', onSquareClick);
  });
  resetBtn.addEventListener('click', () => {
    state.board = JSON.parse(JSON.stringify(start));
    state.turn = 'w';
    state.selected = null;
    state.movesCache = null;
    render();
  });
  botBtn.addEventListener('click', () => {
    state.vsBot = !state.vsBot;
    botBtn.textContent = state.vsBot ? 'Matikan Bot' : 'Main vs Bot (Hitam)';
    render();
    if(state.vsBot && state.turn==='b') setTimeout(botMove, 300);
  });
}

function botMove(){
  // very simple: choose random legal move for black
  const moves = allMoves(state.board, 'b');
  if(moves.length===0){
    statusEl.textContent = 'Putih Menang! (tidak ada langkah hitam)';
    return;
  }
  const mv = moves[Math.floor(Math.random()*moves.length)];
  // apply
  const b = state.board;
  b[mv.to.r][mv.to.c] = b[mv.from.r][mv.from.c];
  b[mv.from.r][mv.from.c] = null;
  // promotion
  if(b[mv.to.r][mv.to.c][1]==='P' && mv.to.r===7){
    b[mv.to.r][mv.to.c] = 'bQ';
  }
  state.turn = 'w';
  render();
}

function init(){
  render();
  bindEvents();
}
init();
