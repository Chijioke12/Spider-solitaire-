import { useState, useEffect, useRef } from 'preact/hooks';

declare const Phaser: any;

type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

interface CardData {
  id: string;
  suit: Suit;
  rank: number;
  visible: boolean;
}

interface GameStateSnapshot {
  tableau: CardData[][];
  stock: CardData[];
  completed: Suit[];
  score: number;
  moves: number;
}

class SoundManager {
  private ctx: AudioContext | null = null;
  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }
  playMove() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }
  playDeal() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.25);
  }
  playError() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, this.ctx.currentTime);
    osc.frequency.setValueAtTime(110, this.ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }
  playChime() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      gain.gain.setValueAtTime(0.04, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.1 + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.3);
    });
  }
}
const sound = new SoundManager();

class SolitaireScene extends Phaser.Scene {
  public suitsCount: 1 | 2 | 4 = 1;
  public tableau: CardData[][] = [];
  public stock: CardData[] = [];
  public completed: Suit[] = [];
  public score: number = 500;
  public moves: number = 0;
  
  public history: GameStateSnapshot[] = [];
  
  private onStateUpdate!: (data: { score: number; moves: number; completed: Suit[]; stockCount: number; hasWon: boolean; selectedCol: number | null }) => void;

  private cardsGroup!: Phaser.GameObjects.Group;
  
  // Navigation Cursor
  public cursorCol: number = 0;
  public cursorCardIdx: number = 0;
  public selectedCol: number | null = null;
  public selectedCardIdx: number | null = null;

  // Animation & Glow state
  public isAnimating: boolean = false;
  public pulseValue: number = 0.5;

  // Hint state
  public activeHint: {
    fromCol: number;
    fromCardIdx: number;
    toCol: number;
    expiresAt: number;
  } | null = null;

  private cursorIndicator!: Phaser.GameObjects.Graphics;
  private selectionIndicator!: Phaser.GameObjects.Graphics;

  constructor() {
    super('SolitaireScene');
  }

  init(data: { suitsCount: 1 | 2 | 4; onStateUpdate: any }) {
    this.suitsCount = data.suitsCount;
    this.onStateUpdate = data.onStateUpdate;
    this.history = [];
    this.score = 500;
    this.moves = 0;
    this.completed = [];
    this.cursorCol = 0;
    this.cursorCardIdx = 0;
    this.selectedCol = null;
    this.selectedCardIdx = null;
    this.isAnimating = false;
    this.pulseValue = 0.5;
    this.activeHint = null;
  }

  preload() {
    this.load.spritesheet('cards', 'cards.png', { frameWidth: 20, frameHeight: 28 });
  }

  create() {
    this.cardsGroup = this.add.group();

    this.cursorIndicator = this.add.graphics();
    this.cursorIndicator.setDepth(100);
    this.selectionIndicator = this.add.graphics();
    this.selectionIndicator.setDepth(90);

    // Create dynamic colors for particles (sparkle, rose, sky, white)
    const colors = [0xfbbf24, 0xf43f5e, 0x38bdf8, 0xffffff];
    colors.forEach((c, idx) => {
      const g = this.add.graphics();
      g.fillStyle(c, 1);
      g.fillRect(0, 0, 2, 2);
      g.generateTexture(`part_${idx}`, 2, 2);
      g.destroy();
    });

    // Pulse value infinite tween for glowing indicators
    this.tweens.add({
      targets: this,
      pulseValue: 1,
      duration: 750,
      yoyo: true,
      repeat: -1,
      onUpdate: () => {
        this.drawIndicators();
      }
    });

    this.generateDeck();
    this.drawBoard();
    this.updateReact();

    this.game.events.on('deal', this.handleDeal, this);
    this.game.events.on('undo', this.handleUndo, this);
    this.game.events.on('move', this.handleMoveCursor, this);
    this.game.events.on('action', this.handleActionOk, this);
    this.game.events.on('clear', this.handleClearSelection, this);
    this.game.events.on('hint', this.findHint, this);

    this.game.events.on('restart', (suits: 1 | 2 | 4) => {
      this.suitsCount = suits;
      this.history = [];
      this.score = 500;
      this.moves = 0;
      this.completed = [];
      this.cursorCol = 0;
      this.cursorCardIdx = 0;
      this.selectedCol = null;
      this.selectedCardIdx = null;
      this.isAnimating = false;
      this.activeHint = null;
      this.generateDeck();
      this.drawBoard();
      this.updateReact();
    }, this);
  }

  private generateDeck() {
    const newDeck: CardData[] = [];
    const suitsToUse: Suit[] = [];

    if (this.suitsCount === 1) {
      for (let i = 0; i < 8; i++) suitsToUse.push('spades');
    } else if (this.suitsCount === 2) {
      for (let i = 0; i < 4; i++) {
        suitsToUse.push('spades');
        suitsToUse.push('hearts');
      }
    } else {
      for (let i = 0; i < 2; i++) {
        suitsToUse.push('spades');
        suitsToUse.push('hearts');
        suitsToUse.push('diamonds');
        suitsToUse.push('clubs');
      }
    }

    let cardId = 0;
    suitsToUse.forEach((suit) => {
      for (let rank = 1; rank <= 13; rank++) {
        newDeck.push({
          id: `${suit}-${rank}-${cardId++}`,
          suit,
          rank,
          visible: false,
        });
      }
    });

    for (let i = newDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }

    const initialTableau: CardData[][] = Array.from({ length: 10 }, () => []);
    let deckIndex = 0;

    for (let i = 0; i < 10; i++) {
      const count = i < 4 ? 6 : 5;
      for (let j = 0; j < count; j++) {
        const card = newDeck[deckIndex++];
        if (j === count - 1) card.visible = true;
        initialTableau[i].push(card);
      }
    }

    this.tableau = initialTableau;
    this.stock = newDeck.slice(deckIndex);
  }

  private saveSnapshot() {
    const deepTableauCopy = this.tableau.map(col => col.map(c => ({ ...c })));
    const deepStockCopy = this.stock.map(c => ({ ...c }));
    this.history.push({
      tableau: deepTableauCopy,
      stock: deepStockCopy,
      completed: [...this.completed],
      score: this.score,
      moves: this.moves,
    });
  }

  private handleUndo() {
    if (this.isAnimating) return;
    if (this.selectedCol !== null) {
      // Auto-move/auto-complete if card is selected!
      const destCol = this.findBestAutoMoveDestination(this.selectedCol, this.selectedCardIdx!);
      if (destCol !== null) {
        this.moveCards(this.selectedCol, this.selectedCardIdx!, destCol);
      } else {
        sound.playError();
      }
      return;
    }
    if (this.history.length === 0) {
      sound.playError();
      return;
    }
    const previous = this.history.pop()!;
    this.tableau = previous.tableau;
    this.stock = previous.stock;
    this.completed = previous.completed;
    this.score = previous.score;
    this.moves = previous.moves;
    this.selectedCol = null;
    this.selectedCardIdx = null;
    sound.playMove();
    this.drawBoard();
    this.updateReact();
  }

  private handleClearSelection() {
    if (this.isAnimating) return;
    this.activeHint = null;
    if (this.selectedCol !== null) {
      this.selectedCol = null;
      this.selectedCardIdx = null;
      sound.playMove();
      this.drawBoard();
    }
  }

  private handleMoveCursor(direction: 'up' | 'down' | 'left' | 'right') {
    if (this.isAnimating) return;
    if (direction === 'left') {
      if (this.cursorCol > 0) {
        this.cursorCol--;
        const col = this.tableau[this.cursorCol];
        this.cursorCardIdx = Math.max(0, col.length - 1);
        sound.playMove();
      }
    } else if (direction === 'right') {
      if (this.cursorCol < 9) {
        this.cursorCol++;
        const col = this.tableau[this.cursorCol];
        this.cursorCardIdx = Math.max(0, col.length - 1);
        sound.playMove();
      }
    } else if (direction === 'up') {
      const col = this.tableau[this.cursorCol];
      if (this.cursorCardIdx > 0 && col[this.cursorCardIdx - 1].visible) {
        this.cursorCardIdx--;
        sound.playMove();
      }
    } else if (direction === 'down') {
      const col = this.tableau[this.cursorCol];
      if (this.cursorCardIdx < col.length - 1) {
        this.cursorCardIdx++;
        sound.playMove();
      }
    }
    this.drawBoard();
  }

  private handleActionOk() {
    if (this.isAnimating) return;
    if (this.selectedCol === null) {
      // Pick up cards / Auto-move if possible
      const col = this.tableau[this.cursorCol];
      if (col.length > 0 && col[this.cursorCardIdx] && col[this.cursorCardIdx].visible) {
        if (this.canMoveGroup(this.cursorCol, this.cursorCardIdx)) {
          // Check if there is a valid auto-move destination (e.g. placing 4 on 5)
          const destCol = this.findBestAutoMoveDestination(this.cursorCol, this.cursorCardIdx);
          if (destCol !== null) {
            // Move immediately to save time and stress!
            this.moveCards(this.cursorCol, this.cursorCardIdx, destCol);
          } else {
            // Otherwise, select it so the user can move it manually
            this.selectedCol = this.cursorCol;
            this.selectedCardIdx = this.cursorCardIdx;
            sound.playMove();
          }
        } else {
          sound.playError();
        }
      } else {
        sound.playError();
      }
    } else {
      // Place cards
      if (this.cursorCol === this.selectedCol) {
        // Try auto-complete / auto-move
        const destCol = this.findBestAutoMoveDestination(this.selectedCol, this.selectedCardIdx!);
        if (destCol !== null) {
          this.moveCards(this.selectedCol, this.selectedCardIdx!, destCol);
        } else {
          this.selectedCol = null;
          this.selectedCardIdx = null;
          sound.playMove(); // play a deselect sound
        }
      } else if (this.canPlaceGroup(this.selectedCol, this.selectedCardIdx!, this.cursorCol)) {
        this.moveCards(this.selectedCol, this.selectedCardIdx!, this.cursorCol);
      } else {
        sound.playError();
        this.selectedCol = null;
        this.selectedCardIdx = null;
      }
    }
    this.drawBoard();
  }

  private handleDeal() {
    if (this.isAnimating) return;
    this.activeHint = null;
    if (this.selectedCol !== null) {
      this.selectedCol = null;
      this.selectedCardIdx = null;
      sound.playMove();
      this.drawBoard();
      this.updateReact();
      return;
    }
    if (this.stock.length === 0) {
      sound.playError();
      return;
    }
    const hasEmptyCol = this.tableau.some(col => col.length === 0);
    if (hasEmptyCol) {
      sound.playError();
      return;
    }

    this.saveSnapshot();
    this.isAnimating = true;

    const dealsLeft = this.stock.length / 10;
    const startX = 15 + (dealsLeft - 1) * 3;
    const startY = 270;

    const cardsToDeal: CardData[] = [];
    const currentStock = [...this.stock];
    for (let i = 0; i < 10; i++) {
      const card = currentStock.pop();
      if (card) {
        card.visible = true;
        cardsToDeal.push(card);
      }
    }
    this.stock = currentStock;
    this.moves++;
    this.updateReact();

    this.drawBoard(); // draw immediate stock changes

    let completedCount = 0;

    cardsToDeal.forEach((card, i) => {
      const targetColIdx = i;
      const targetCol = this.tableau[targetColIdx];
      const colWidth = 20;
      const colSpacing = 3;
      const leftMargin = 6.5;
      const colX = leftMargin + targetColIdx * (colWidth + colSpacing) + colWidth / 2;
      
      const nextOverlap = this.getCardOverlap(targetCol.length + 1);
      const cardY = 48 + targetCol.length * nextOverlap;

      const tempCard = this.add.sprite(startX, startY, 'cards', 52);
      tempCard.setDepth(200);

      this.time.delayedCall(i * 100, () => {
        sound.playDeal();

        this.tweens.add({
          targets: tempCard,
          x: colX,
          y: cardY,
          duration: 300,
          ease: 'Cubic.easeOut',
          onComplete: () => {
            this.tweens.add({
              targets: tempCard,
              scaleX: 0,
              duration: 80,
              yoyo: true,
              onYoyo: () => {
                const suitRows: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
                const row = suitRows.indexOf(card.suit);
                const colIdx = card.rank - 1;
                const frameIdx = row * 13 + colIdx;
                tempCard.setFrame(frameIdx);
              },
              onComplete: () => {
                targetCol.push(card);
                tempCard.destroy();
                this.drawBoard();

                completedCount++;
                if (completedCount === 10) {
                  this.isAnimating = false;
                  this.checkCompletedSequences();
                  this.updateReact();
                }
              }
            });
          }
        });
      });
    });
  }

  private findBestAutoMoveDestination(sourceColIdx: number, startCardIdx: number): number | null {
    const sourceCol = this.tableau[sourceColIdx];
    if (!sourceCol || sourceCol.length === 0 || startCardIdx >= sourceCol.length) return null;
    const topSelectedCard = sourceCol[startCardIdx];
    if (!topSelectedCard) return null;
    
    let bestColIdx: number | null = null;
    let bestScore = -1;

    for (let i = 0; i < 10; i++) {
      if (i === sourceColIdx) continue;
      const targetCol = this.tableau[i];
      if (!targetCol) continue;
      
      if (this.canPlaceGroup(sourceColIdx, startCardIdx, i)) {
        let score = 0;
        if (targetCol.length > 0) {
          const targetCard = targetCol[targetCol.length - 1];
          if (targetCard && targetCard.suit === topSelectedCard.suit) {
            score = 100; // Same suit match is best
          } else {
            score = 50; // Different suit match is okay
          }
        } else {
          // Empty column
          if (topSelectedCard.rank === 13) {
            score = 25; // Kings can only go to empty, so this is good
          } else {
            score = 10; // Others can go to empty but it's least preferred
          }
        }
        
        if (score > bestScore) {
          bestScore = score;
          bestColIdx = i;
        }
      }
    }
    return bestColIdx;
  }

  private findHint() {
    if (this.isAnimating) return;

    let bestMove: { fromCol: number; fromCardIdx: number; toCol: number; score: number } | null = null;

    for (let i = 0; i < 10; i++) {
      const col = this.tableau[i];
      if (!col || col.length === 0) continue;

      for (let j = col.length - 1; j >= 0; j--) {
        if (this.canMoveGroup(i, j)) {
          const topSelectedCard = col[j];
          if (!topSelectedCard) continue;

          for (let k = 0; k < 10; k++) {
            if (i === k) continue;
            if (this.canPlaceGroup(i, j, k)) {
              let score = 0;
              const targetCol = this.tableau[k];
              if (targetCol && targetCol.length > 0) {
                const targetCard = targetCol[targetCol.length - 1];
                if (targetCard && targetCard.suit === topSelectedCard.suit) {
                  score = 100; // Same suit match
                } else {
                  score = 50; // Different suit match
                }
              } else {
                // Empty column
                if (topSelectedCard.rank === 13) {
                  score = 30; // King to empty is very good
                } else {
                  score = 10; // Other card to empty
                }
              }

              // Prioritize uncovering face-down cards
              if (j > 0 && !col[j - 1].visible) {
                score += 15;
              }

              if (!bestMove || score > bestMove.score) {
                bestMove = { fromCol: i, fromCardIdx: j, toCol: k, score };
              }
            }
          }
        }
      }
    }

    if (bestMove) {
      sound.playMove();

      this.activeHint = {
        fromCol: bestMove.fromCol,
        fromCardIdx: bestMove.fromCardIdx,
        toCol: bestMove.toCol,
        expiresAt: this.time.now + 6000,
      };

      // Set keyboard cursor directly to the hint card so the user can easily select & move it!
      this.cursorCol = bestMove.fromCol;
      this.cursorCardIdx = bestMove.fromCardIdx;

      this.drawBoard();
      this.updateReact();
    } else {
      sound.playError();
    }
  }

  private canMoveGroup(colIdx: number, startCardIdx: number): boolean {
    const col = this.tableau[colIdx];
    if (!col || col.length === 0 || startCardIdx >= col.length) return false;
    if (!col[startCardIdx] || !col[startCardIdx].visible) return false;

    const suit = col[startCardIdx].suit;
    for (let i = startCardIdx; i < col.length - 1; i++) {
      const current = col[i];
      const next = col[i + 1];
      if (!current || !next || !next.visible || next.suit !== suit || current.rank - next.rank !== 1) {
        return false;
      }
    }
    return true;
  }

  private canPlaceGroup(fromColIdx: number, cardIdx: number, toColIdx: number): boolean {
    const targetCol = this.tableau[toColIdx];
    const sourceCol = this.tableau[fromColIdx];
    if (!sourceCol) return false;
    const sourceCard = sourceCol[cardIdx];
    if (!sourceCard) return false;

    if (!targetCol || targetCol.length === 0) return true;

    const targetLastCard = targetCol[targetCol.length - 1];
    if (!targetLastCard) return true;
    return targetLastCard.rank - sourceCard.rank === 1;
  }

  private moveCards(fromColIdx: number, startCardIdx: number, toColIdx: number) {
    if (this.isAnimating) return;
    this.activeHint = null;
    this.saveSnapshot();
    this.isAnimating = true;

    const fromCol = [...this.tableau[fromColIdx]];
    const toCol = [...this.tableau[toColIdx]];
    const cardsToMove = fromCol.splice(startCardIdx);

    const colWidth = 20;
    const colSpacing = 3;
    const leftMargin = 6.5;

    const fromColX = leftMargin + fromColIdx * (colWidth + colSpacing) + colWidth / 2;
    const toColX = leftMargin + toColIdx * (colWidth + colSpacing) + colWidth / 2;

    const fromOverlap = this.getCardOverlap(this.tableau[fromColIdx].length);
    const toOverlap = this.getCardOverlap(toCol.length + cardsToMove.length);

    this.tableau[fromColIdx] = fromCol;
    this.drawBoard();

    const movingContainer = this.add.container(fromColX, 0);
    movingContainer.setDepth(300);

    const suitRows: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

    cardsToMove.forEach((card, idx) => {
      const startLocalY = 48 + (startCardIdx + idx) * fromOverlap;
      const row = suitRows.indexOf(card.suit);
      const col = card.rank - 1;
      const frameIdx = row * 13 + col;

      const sprite = this.add.sprite(0, startLocalY, 'cards', frameIdx);
      movingContainer.add(sprite);
    });

    sound.playMove();

    this.tweens.add({
      targets: movingContainer,
      x: toColX,
      duration: 200,
      ease: 'Quad.easeOut',
    });

    let animCompleteCount = 0;
    cardsToMove.forEach((card, idx) => {
      const childSprite = movingContainer.list[idx] as Phaser.GameObjects.Sprite;
      const targetLocalY = 48 + (toCol.length + idx) * toOverlap;

      this.tweens.add({
        targets: childSprite,
        y: targetLocalY,
        duration: 200,
        ease: 'Quad.easeOut',
        onComplete: () => {
          animCompleteCount++;
          if (animCompleteCount === cardsToMove.length) {
            toCol.push(...cardsToMove);
            this.tableau[toColIdx] = toCol;
            movingContainer.destroy();

            if (fromCol.length > 0 && !fromCol[fromCol.length - 1].visible) {
              const flipColX = leftMargin + fromColIdx * (colWidth + colSpacing) + colWidth / 2;
              const flipCardY = 48 + (fromCol.length - 1) * fromOverlap;

              const flipSprite = this.add.sprite(flipColX, flipCardY, 'cards', 52);
              flipSprite.setDepth(200);

              this.tweens.add({
                targets: flipSprite,
                scaleX: 0,
                duration: 100,
                yoyo: true,
                onYoyo: () => {
                  const targetCard = fromCol[fromCol.length - 1];
                  const r = suitRows.indexOf(targetCard.suit);
                  const c = targetCard.rank - 1;
                  flipSprite.setFrame(r * 13 + c);
                  targetCard.visible = true; 
                },
                onComplete: () => {
                  flipSprite.destroy();
                  this.finalizeMoveAndCheck();
                }
              });
            } else {
              this.finalizeMoveAndCheck();
            }
          }
        }
      });
    });
  }

  private finalizeMoveAndCheck() {
    this.isAnimating = false;
    this.checkCompletedSequences();
    this.moves++;
    this.score = Math.max(0, this.score - 1);
    this.selectedCol = null;
    this.selectedCardIdx = null;
    
    // adjust cursor if column got smaller
    const col = this.tableau[this.cursorCol];
    if (this.cursorCardIdx >= col.length) {
      this.cursorCardIdx = Math.max(0, col.length - 1);
    }
    
    this.drawBoard();
    this.updateReact();
  }

  private triggerSparklesAt(x: number, y: number) {
    for (let i = 0; i < 40; i++) {
      const partIdx = Phaser.Math.Between(0, 3);
      const p = this.add.sprite(x + Phaser.Math.Between(-8, 8), y + Phaser.Math.Between(-40, 40), `part_${partIdx}`);
      p.setDepth(500);
      
      const vx = Phaser.Math.Between(-80, 80);
      const vy = Phaser.Math.Between(-140, -40);
      
      this.tweens.add({
        targets: p,
        x: p.x + vx * 0.5,
        y: p.y + vy * 0.5,
        alpha: 0,
        scaleX: 0.1,
        scaleY: 0.1,
        duration: Phaser.Math.Between(400, 900),
        onComplete: () => {
          p.destroy();
        }
      });
    }
  }

  private checkCompletedSequences() {
    let completedRunColIdx = -1;
    let completedRunStartIdx = -1;
    let completedSuit: Suit | null = null;

    for (let i = 0; i < 10; i++) {
      const col = this.tableau[i];
      if (col.length < 13) continue;

      for (let j = col.length - 13; j >= 0; j--) {
        if (col[j].visible && col[j].rank === 13) {
          const suit = col[j].suit;
          let isComplete = true;
          for (let k = 0; k < 13; k++) {
            const card = col[j + k];
            if (!card.visible || card.suit !== suit || card.rank !== (13 - k)) {
              isComplete = false;
              break;
            }
          }

          if (isComplete) {
            completedRunColIdx = i;
            completedRunStartIdx = j;
            completedSuit = suit;
            break;
          }
        }
      }
      if (completedRunColIdx !== -1) break;
    }

    if (completedRunColIdx !== -1 && completedSuit !== null) {
      this.isAnimating = true;
      const colIdx = completedRunColIdx;
      const startIdx = completedRunStartIdx;
      const suit = completedSuit;

      const col = this.tableau[colIdx];
      const cardsToClear = col.slice(startIdx);

      const colWidth = 20;
      const colSpacing = 3;
      const leftMargin = 6.5;
      const colX = leftMargin + colIdx * (colWidth + colSpacing) + colWidth / 2;
      const overlap = this.getCardOverlap(col.length);

      this.triggerSparklesAt(colX, 48 + (startIdx + 6) * overlap);

      const nextCompIdx = this.completed.length;
      const targetX = 225 - nextCompIdx * 4;
      const targetY = 270;

      const tempSprites: Phaser.GameObjects.Sprite[] = [];

      cardsToClear.forEach((card, idx) => {
        const cardY = 24 + (startIdx + idx) * overlap;
        const suitRows: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
        const r = suitRows.indexOf(card.suit);
        const c = card.rank - 1;
        const frameIdx = r * 13 + c;

        const sprite = this.add.sprite(colX, cardY, 'cards', frameIdx);
        sprite.setDepth(400);
        tempSprites.push(sprite);
      });

      col.splice(startIdx, 13);
      this.drawBoard();

      let arrivalCount = 0;
      tempSprites.forEach((sprite, idx) => {
        this.tweens.add({
          targets: sprite,
          x: targetX,
          y: targetY,
          angle: 360,
          scaleX: 0.8,
          scaleY: 0.8,
          duration: 600,
          ease: 'Back.easeIn',
          delay: idx * 30,
          onComplete: () => {
            sprite.destroy();
            arrivalCount++;

            if (arrivalCount === tempSprites.length) {
              this.completed = [...this.completed, suit];
              this.score += 100;
              sound.playChime();

              if (col.length > 0 && !col[col.length - 1].visible) {
                const flipColX = leftMargin + colIdx * (colWidth + colSpacing) + colWidth / 2;
                const flipOverlap = this.getCardOverlap(col.length);
                const flipCardY = 48 + (col.length - 1) * flipOverlap;

                const flipSprite = this.add.sprite(flipColX, flipCardY, 'cards', 52);
                flipSprite.setDepth(200);

                this.tweens.add({
                  targets: flipSprite,
                  scaleX: 0,
                  duration: 150,
                  yoyo: true,
                  onYoyo: () => {
                    const targetCard = col[col.length - 1];
                    const suitRows: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
                    const r = suitRows.indexOf(targetCard.suit);
                    const c = targetCard.rank - 1;
                    flipSprite.setFrame(r * 13 + c);
                    targetCard.visible = true;
                  },
                  onComplete: () => {
                    flipSprite.destroy();
                    this.isAnimating = false;
                    this.drawBoard();
                    this.checkCompletedSequences();
                    this.updateReact();
                  }
                });
              } else {
                this.isAnimating = false;
                this.drawBoard();
                this.checkCompletedSequences();
                this.updateReact();
              }
            }
          }
        });
      });
    }
  }

  private getCardOverlap(count: number): number {
    return 11;
  }

  private drawBoard() {
    this.cardsGroup.clear(true, true);

    const colWidth = 20;
    const colSpacing = 3;
    const leftMargin = 6.5;

    this.tableau.forEach((col, i) => {
      const x = leftMargin + i * (colWidth + colSpacing) + colWidth / 2;
      const overlap = this.getCardOverlap(col.length);
      
      const emptySprite = this.add.sprite(x, 48, 'cards', 53);
      this.cardsGroup.add(emptySprite);

      col.forEach((card, j) => {
        const y = 48 + j * overlap;
        
        let frameIdx = 52;
        if (card.visible) {
          const suitRows: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
          const row = suitRows.indexOf(card.suit);
          const c = card.rank - 1;
          frameIdx = row * 13 + c;
        }

        const sprite = this.add.sprite(x, y, 'cards', frameIdx);
        this.cardsGroup.add(sprite);
      });
    });

    const dealsLeft = this.stock.length / 10;
    
    // Draw empty stock placeholder
    const emptyStockSprite = this.add.sprite(15, 270, 'cards', 53);
    this.cardsGroup.add(emptyStockSprite);

    for (let i = 0; i < dealsLeft; i++) {
      const stockSprite = this.add.sprite(15 + i * 3, 270, 'cards', 52);
      this.cardsGroup.add(stockSprite);
    }

    if (dealsLeft > 0) {
      const stockText = this.add.text(15, 252, `DEALS:${dealsLeft}`, { fontSize: '7px', color: '#ffffff', fontFamily: 'monospace' }).setOrigin(0.5, 0.5);
      this.cardsGroup.add(stockText);
    }

    this.completed.forEach((suit, idx) => {
      const suitRows: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
      const row = suitRows.indexOf(suit);
      const frameIdx = row * 13 + 12;
      const compSprite = this.add.sprite(225 - idx * 4, 270, 'cards', frameIdx);
      this.cardsGroup.add(compSprite);
    });

    this.drawIndicators();
  }

  private drawIndicators() {
    this.cursorIndicator.clear();
    this.selectionIndicator.clear();

    const cardW = 20;
    const colWidth = 20;
    const colSpacing = 3;
    const leftMargin = 6.5;

    // 1. Draw Keyboard Selection indicators with glowing pulse alpha
    if (this.selectedCol !== null && this.selectedCardIdx !== null) {
      const fromX = leftMargin + this.selectedCol * (colWidth + colSpacing) + colWidth / 2;
      const col = this.tableau[this.selectedCol];
      const overlap = this.getCardOverlap(col.length);
      const startY = 48 + this.selectedCardIdx * overlap;
      const endY = col.length > 0 ? (48 + (col.length - 1) * overlap) : 48;
      const rectH = (endY - startY) + 28;

      this.selectionIndicator.lineStyle(2, 0x3b82f6, this.pulseValue);
      this.selectionIndicator.strokeRoundedRect(fromX - cardW / 2 - 1, startY - 14 - 1, cardW + 2, rectH + 2, 4);

      // Draw Auto-Match visual helper highlighting target columns (e.g. matching 3 with 4)
      const topSelectedCard = col[this.selectedCardIdx];
      if (topSelectedCard) {
        for (let i = 0; i < 10; i++) {
          if (i === this.selectedCol) continue;
          if (this.canPlaceGroup(this.selectedCol, this.selectedCardIdx, i)) {
            const targetCol = this.tableau[i];
            const targetX = leftMargin + i * (colWidth + colSpacing) + colWidth / 2;
            const targetOverlap = this.getCardOverlap(targetCol.length);
            const targetY = targetCol.length > 0 ? (48 + (targetCol.length - 1) * targetOverlap) : 48;
            const cardH = 28;

            let highlightColor = 0x10b981; // emerald green for perfect suit match
            if (targetCol.length > 0) {
              const lastCard = targetCol[targetCol.length - 1];
              if (lastCard && lastCard.suit !== topSelectedCard.suit) {
                highlightColor = 0x06b6d4; // cyan for different suit match
              }
            } else {
              highlightColor = 0xe2e8f0; // slate gray for empty columns
            }

            this.selectionIndicator.lineStyle(1.5, highlightColor, this.pulseValue * 0.85);
            this.selectionIndicator.strokeRoundedRect(targetX - cardW / 2, targetY - 14, cardW, cardH, 4);
          }
        }
      }
    }

    // 2. Draw active Keyboard Navigation cursor indicator with glowing pulse alpha
    const currentX = leftMargin + this.cursorCol * (colWidth + colSpacing) + colWidth / 2;
    const col = this.tableau[this.cursorCol];
    const overlap = this.getCardOverlap(col.length);
    
    if (this.selectedCol === null) {
      const currentY = col.length > 0 ? (48 + this.cursorCardIdx * overlap) : 48;
      const cardH = 28;

      this.cursorIndicator.lineStyle(2, 0xfbbf24, this.pulseValue);
      this.cursorIndicator.strokeRoundedRect(currentX - cardW / 2 - 1, currentY - cardH / 2 - 1, cardW + 2, cardH + 2, 4);
    } else {
      const startY = 48;
      const endY = col.length > 0 ? (48 + (col.length - 1) * overlap) : 48;
      const rectH = col.length > 0 ? (endY - startY + 28) : 28;

      this.cursorIndicator.lineStyle(2, 0x10b981, this.pulseValue);
      this.cursorIndicator.strokeRoundedRect(currentX - cardW / 2 - 1, startY - 14 - 1, cardW + 2, rectH + 2, 4);
    }

    // 3. Draw Active Hint overlay (if active and not expired)
    if (this.activeHint !== null) {
      if (this.time.now < this.activeHint.expiresAt) {
        const fromCol = this.activeHint.fromCol;
        const fromCardIdx = this.activeHint.fromCardIdx;
        const toCol = this.activeHint.toCol;

        const sourceCol = this.tableau[fromCol];
        const sourceOverlap = this.getCardOverlap(sourceCol ? sourceCol.length : 0);
        const sourceX = leftMargin + fromCol * (colWidth + colSpacing) + colWidth / 2;
        const sourceYStart = 48 + fromCardIdx * sourceOverlap;
        const sourceYEnd = (sourceCol && sourceCol.length > 0) ? (48 + (sourceCol.length - 1) * sourceOverlap) : 48;
        const sourceRectH = (sourceYEnd - sourceYStart) + 28;

        const targetCol = this.tableau[toCol];
        const targetOverlap = this.getCardOverlap(targetCol ? targetCol.length : 0);
        const targetX = leftMargin + toCol * (colWidth + colSpacing) + colWidth / 2;
        const targetY = (targetCol && targetCol.length > 0) ? (48 + (targetCol.length - 1) * targetOverlap) : 48;
        const targetRectH = 28;

        const flashAlpha = 0.5 + 0.5 * Math.abs(Math.sin(this.time.now / 150));
        
        // Draw source orange flashing border
        this.selectionIndicator.lineStyle(2.5, 0xf59e0b, flashAlpha);
        this.selectionIndicator.strokeRoundedRect(sourceX - cardW / 2 - 2, sourceYStart - 14 - 2, cardW + 4, sourceRectH + 4, 6);

        // Draw destination orange flashing border
        this.selectionIndicator.lineStyle(2.5, 0xf59e0b, flashAlpha);
        this.selectionIndicator.strokeRoundedRect(targetX - cardW / 2 - 2, targetY - 14 - 2, cardW + 4, targetRectH + 4, 6);

        // Draw connecting orange dashed line
        this.selectionIndicator.lineStyle(2, 0xf59e0b, flashAlpha * 0.7);
        this.selectionIndicator.lineBetween(sourceX, sourceYStart + sourceRectH / 2 - 14, targetX, targetY);
      } else {
        this.activeHint = null;
      }
    }
  }

  private updateReact() {
    this.onStateUpdate({
      score: this.score,
      moves: this.moves,
      completed: this.completed,
      stockCount: this.stock.length,
      hasWon: this.completed.length === 8,
      selectedCol: this.selectedCol,
    });
  }
}

export default function App() {
  const [suitsCount, setSuitsCount] = useState<1 | 2 | 4>(1);
  const [score, setScore] = useState(500);
  const [moves, setMoves] = useState(0);
  const [completed, setCompleted] = useState<Suit[]>([]);
  const [stockCount, setStockCount] = useState(50);
  const [hasWon, setHasWon] = useState(false);
  const [selectedCol, setSelectedCol] = useState<number | null>(null);

  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameInstanceRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!gameContainerRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.WEBGL,
      width: 240,
      height: 320,
      parent: gameContainerRef.current,
      backgroundColor: '#166534',
      transparent: true,
      render: { pixelArt: true },
      scene: [SolitaireScene],
    };

    const game = new Phaser.Game(config);
    gameInstanceRef.current = game;

    game.scene.start('SolitaireScene', {
      suitsCount,
      onStateUpdate: (data: any) => {
        setScore(data.score);
        setMoves(data.moves);
        setCompleted(data.completed);
        setStockCount(data.stockCount);
        setHasWon(data.hasWon);
        setSelectedCol(data.selectedCol);
      }
    });

    return () => {
      game.destroy(true);
      gameInstanceRef.current = null;
    };
  }, [suitsCount]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const game = gameInstanceRef.current;
      if (!game) return;
      if (e.key === 'ArrowUp') game.events.emit('move', 'up');
      else if (e.key === 'ArrowDown') game.events.emit('move', 'down');
      else if (e.key === 'ArrowLeft') game.events.emit('move', 'left');
      else if (e.key === 'ArrowRight') game.events.emit('move', 'right');
      else if (e.key === 'Enter') game.events.emit('action');
      else if (e.key === '1' || e.key === 'SoftLeft') game.events.emit('deal');
      else if (e.key === '3' || e.key === 'SoftRight') game.events.emit('undo');
      else if (e.key === '5' || e.key.toLowerCase() === 'h') game.events.emit('hint');
      else if (e.key === 'Backspace' || e.key === 'Escape') game.events.emit('clear');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleRestart = (s: 1 | 2 | 4) => {
    setSuitsCount(s);
    if (gameInstanceRef.current) {
      gameInstanceRef.current.events.emit('restart', s);
    }
  };

  const handleAction = (action: string, param?: any) => {
    if (gameInstanceRef.current) {
      gameInstanceRef.current.events.emit(action, param);
    }
  };

  return (
    <div className="workspace-container">
      {/* Device HUD Box */}
      <div className="controls-hud-panel">
        <h2 className="hud-section-title" style={{ fontSize: '1.2rem', color: '#fbbf24', borderBottom: '1px solid #1e293b', paddingBottom: '0.5rem' }}>KaiOS Spider Solitaire</h2>
        <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '1rem' }}>
          This simulator maps physical keypad hardware directly to game functions.
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: 'rgba(2,6,23,0.4)', padding: '0.5rem', borderRadius: '4px' }}>
            <span style={{ color: '#2dd4bf', fontWeight: 'bold' }}>D-Pad</span>
            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Move Cursor</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: 'rgba(2,6,23,0.4)', padding: '0.5rem', borderRadius: '4px' }}>
            <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>OK (Center)</span>
            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Select / Place (Double tap to Auto-Move)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: 'rgba(2,6,23,0.4)', padding: '0.5rem', borderRadius: '4px' }}>
            <span style={{ color: '#2dd4bf', fontWeight: 'bold' }}>Key 1 / Call</span>
            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Deal Cards</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: 'rgba(2,6,23,0.4)', padding: '0.5rem', borderRadius: '4px' }}>
            <span style={{ color: '#2dd4bf', fontWeight: 'bold' }}>Key 3 / Back</span>
            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Undo Move</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: 'rgba(2,6,23,0.4)', padding: '0.5rem', borderRadius: '4px' }}>
            <span style={{ color: '#2dd4bf', fontWeight: 'bold' }}>Key 5 / H</span>
            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Show Best Move Hint</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: 'rgba(2,6,23,0.4)', padding: '0.5rem', borderRadius: '4px' }}>
            <span style={{ color: '#2dd4bf', fontWeight: 'bold' }}>End / Clear</span>
            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Clear Selection</span>
          </div>
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button style={{ flex: 1, padding: '0.5rem', backgroundColor: '#334155', color: '#fff', border: 'none', borderRadius: '4px' }} onClick={() => handleRestart(1)}>1 Suit</button>
          <button style={{ flex: 1, padding: '0.5rem', backgroundColor: '#334155', color: '#fff', border: 'none', borderRadius: '4px' }} onClick={() => handleRestart(2)}>2 Suits</button>
          <button style={{ flex: 1, padding: '0.5rem', backgroundColor: '#334155', color: '#fff', border: 'none', borderRadius: '4px' }} onClick={() => handleRestart(4)}>4 Suits</button>
        </div>
      </div>

      {/* The Physical Device Container */}
      <div className="phone-chassis">
        <div className="phone-speaker-grille"></div>

        {/* The 240x320 KaiOS Display Panel */}
        <div className="kaios-display-screen" style={{ position: 'relative' }}>
          {/* Status Bar - Overlay */}
          <div className="screen-status-bar" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50, backgroundColor: 'rgba(2, 6, 23, 0.8)' }}>
            <span>SPIDER</span>
            <span>
              SCORE: <span style={{ color: '#fcd34d' }}>{score}</span>
            </span>
          </div>

          <div style={{
            position: 'absolute',
            top: '18px',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'space-between',
            padding: '2px 4px',
            backgroundColor: 'rgba(0,0,0,0.5)',
            fontSize: '8px',
            height: '14px',
            boxSizing: 'border-box',
            zIndex: 45
          }}>
            <span>Mv: {moves}</span>
            <span>Comp: {completed.length}/8</span>
            <span>Stk: {stockCount}</span>
          </div>

          <div className="screen-game-stage" ref={gameContainerRef} style={{ width: '240px', height: '320px' }}></div>

          {hasWon && (
            <div style={{
              position: 'absolute', inset: 0,
              backgroundColor: 'rgba(2, 6, 23, 0.95)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', zIndex: 60
            }}>
              <div style={{ color: '#fbbf24', fontSize: '14px', fontWeight: 'bold' }}>VICTORY!</div>
              <div style={{ color: '#cbd5e1', fontSize: '10px', marginTop: '4px' }}>Moves: {moves}</div>
              <button 
                style={{ marginTop: '10px', backgroundColor: '#fbbf24', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '10px' }}
                onClick={() => handleRestart(suitsCount)}
              >
                Play Again
              </button>
            </div>
          )}

          {/* Softkey Label Bar - Overlay */}
          <div className="softkey-nav-bar" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 50, backgroundColor: 'rgba(2, 6, 23, 0.9)', height: '22px' }}>
            <span className="softkey-btn left">{selectedCol !== null ? 'CANCEL' : 'DEAL'}</span>
            <span className="softkey-btn center">{selectedCol !== null ? 'PLACE' : 'SELECT'}</span>
            <span className="softkey-btn right">{selectedCol !== null ? 'AUTO-MOVE' : 'UNDO'}</span>
          </div>
        </div>

        {/* Physical Keyboard Emulation */}
        <div className="phone-keypad-panel">
          <div className="keypad-softkeys-cluster">
            <button className="hard-softkey-button" onClick={() => handleAction('deal')}>L-SOFT</button>
            <button className="hard-softkey-button" onClick={() => handleAction('move', 'up')}>UP</button>
            <button className="hard-softkey-button" onClick={() => handleAction('undo')}>R-SOFT</button>
          </div>

          <div className="dpad-container">
            <div className="dpad-ring-base"></div>
            <button className="dpad-arrow-btn up" onClick={() => handleAction('move', 'up')}>▲</button>
            <button className="dpad-arrow-btn down" onClick={() => handleAction('move', 'down')}>▼</button>
            <button className="dpad-arrow-btn left" onClick={() => handleAction('move', 'left')}>◀</button>
            <button className="dpad-arrow-btn right" onClick={() => handleAction('move', 'right')}>▶</button>
            <button className="dpad-ok-center-btn" onClick={() => handleAction('action')}>OK</button>
          </div>

          <div className="call-end-keypad-row">
            <button className="action-status-btn call-new" onClick={() => handleAction('deal')}>CALL</button>
            <button className="action-status-btn undo-back" onClick={() => handleAction('undo')}>BACK</button>
            <button className="action-status-btn end-clear" onClick={() => handleAction('clear')}>END</button>
          </div>

          <div className="numeric-t9-grid">
            {[
              { n: '1', l: 'DEAL' }, { n: '2', l: 'ABC' }, { n: '3', l: 'DEF' },
              { n: '4', l: 'GHI' }, { n: '5', l: 'HINT' }, { n: '6', l: 'MNO' },
              { n: '7', l: 'PQRS' }, { n: '8', l: 'TUV' }, { n: '9', l: 'WXYZ' },
              { n: '*', l: '' }, { n: '0', l: '+' }, { n: '#', l: '' }
            ].map(btn => (
              <button 
                key={btn.n} 
                className="t9-button"
                onClick={() => {
                  if (btn.n === '1') handleAction('deal');
                  else if (btn.n === '3') handleAction('undo');
                  else if (btn.n === '5') handleAction('hint');
                }}
              >
                <span className="t9-num-label">{btn.n}</span>
                {btn.l && <span className="t9-sub-label">{btn.l}</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
