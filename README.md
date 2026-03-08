# Fishing Hol — Massively Multiplayer Fishing Game

A cross-platform MMO fishing game built in Unity where players buy bait, catch fish, and sell their haul — all in a shared, persistent world with proximity voice chat.

---

## Platform Architecture

Fishing Hol runs on **Android** and **WebGL** simultaneously. Both clients connect to the same Node.js server — they share the same world, see the same players, and interact in real time.

```
┌──────────────────────────────────────────────────────────┐
│                    Node.js Server                        │
│              (Express + Socket.IO + PostgreSQL)           │
│                                                          │
│   • Player sessions & movement sync                      │
│   • Inventory persistence (Postgres)                     │
│   • Proximity voice relay                                │
│   • Solana SPL token bridge                              │
└────────────────┬─────────────────┬───────────────────────┘
                 │  Socket.IO      │  Socket.IO
                 │  (WebSocket)    │  (WebSocket)
        ┌────────▼────────┐  ┌────▼──────────────┐
        │   WebGL Client  │  │  Android Client    │
        │                 │  │                    │
        │  JS bridge      │  │  C# SocketClient   │
        │  (client.js)    │  │  (SocketClient.cs) │
        │  ↕ SendMessage  │  │  ↕ direct C# calls │
        │  Unity WebGL    │  │  Unity Android     │
        └─────────────────┘  └────────────────────┘
```

**WebGL** — The browser loads `client.js` which opens a Socket.IO connection. Events are forwarded into the Unity runtime via `SendMessage("NetworkManager", ...)`.

**Android** — A native C# Socket.IO client (`SocketClient.cs`) connects directly over WebSocket. No JS bridge needed.

Both paths feed into the same `NetworkManager` inside Unity, so all game logic is shared.

---

## Voice Chat

Players can talk to nearby players using proximity-based voice chat. The implementation differs per platform but the server protocol is identical.

```
┌───────────────┐          ┌──────────┐          ┌───────────────┐
│  Player A     │          │  Server  │          │  Player B     │
│               │  VOICE   │          │  UPDATE  │               │
│  Mic → WAV → ─┼─ base64 ─►  dist   ─┼─ VOICE ─►  WAV → Audio │
│  16 kHz mono  │          │  check   │          │  playback     │
└───────────────┘          │ (<3 units)│          └───────────────┘
                           └──────────┘
```

- **WebGL**: Uses the Web Audio API (`getUserMedia` + `ScriptProcessorNode`), encodes chunks as 16 kHz WAV, sends base64 over Socket.IO.
- **Android**: Uses Unity's `Microphone` API, same WAV encoding, same Socket.IO transport.
- **Server**: Checks distance between players (~3 units) and only relays audio to those nearby. Supports per-player mute and global mute.

---

## Gameplay Loop

The core loop is: **Buy Bait → Cast → Fight the Fish → Catch → Sell**.

```
  ┌─────────┐     ┌─────────┐     ┌─────────────────┐     ┌─────────┐     ┌──────────┐
  │  SHOP   │     │  CAST   │     │  FIGHT THE FISH  │     │  CATCH  │     │   SELL   │
  │         │     │         │     │                   │     │         │     │          │
  │ Buy     ├────►│ Throw   ├────►│ Fighting / Tired  ├────►│ Keep or ├────►│ Sell at  │
  │ bait    │     │ line    │     │ phases alternate  │     │ release │     │ shop for │
  │ with    │     │ into    │     │ (see below)       │     │ the     │     │ coins    │
  │ coins   │     │ water   │     │                   │     │ fish    │     │          │
  └─────────┘     └─────────┘     └─────────────────┘     └─────────┘     └──────────┘
```

### 1. Buy Bait

Visit a shop and spend coins on bait. There are two bait categories:

| Bait Type | Target Fish | Used With |
|-----------|-------------|-----------|
| **Worm** | Non-predatory fish (Carp, Shiner) | Floater |
| **Spinner** | Predatory fish only (Pike, Trout, Blue Marlin) | Spinner lure |

Choosing the right bait matters — predatory fish **ignore** worms, and non-predatory fish **ignore** spinners.

### 2. Cast Your Line

Equip your rod and bait, then cast into the water. Your float/spinner lands and waits for a bite. A fish will approach if your bait type matches.

### 3. Fight the Fish (Dynamic Catch Mechanic)

This is where it gets interesting. When a fish bites, a **reel bar** appears and the fight begins. The fish alternates between two phases on a randomized timer (2–10 seconds per cycle):

```
            ┌─────────────────────────────────────┐
            │         FISH FIGHT CYCLE             │
            │                                      │
            │   ┌───────────┐     ┌───────────┐   │
            │   │ FIGHTING  │◄───►│   TIRED   │   │
            │   │  phase    │     │   phase   │   │
            │   │           │     │           │   │
            │   │ Bar: RED  │     │ Bar: GREEN│   │
            │   │ Force: 2x │     │ Force: ½x │   │
            │   │ "Ease up!"│     │ "Reel in!"│   │
            │   └───────────┘     └───────────┘   │
            │                                      │
            │   Timer: 2-10s each, then switches   │
            └─────────────────────────────────────┘

    Reel bar fills when you reel ──────────►  [██████████░░░░░░]

    ▲ Bar hits 99%  → Line SNAPS! Bait lost. Fish escapes.
    ▲ Bar stays under control + fish still on → CATCH!
```

**Fighting phase** — The fish pulls hard (2x force). The reel bar climbs fast. If you reel aggressively here, you risk snapping the line. Ease up.

**Tired phase** — The fish weakens (½x force). The reel bar drains. This is your window to reel in. Pull hard.

The player must **read the phases** and react: reel during tired, ease off during fighting. If the bar fills to 99% at any point, the line snaps and you lose your bait. Successfully managing the tension lands the fish.

### 4. Catch or Release

After landing a fish, you choose to **keep** it (added to your backpack inventory) or **release** it.

### 5. Sell at the Shop

Take your fish back to the shop and sell them for coins. Each fish species has a sell value. Harder fish are worth more.

---

## Fish Species & Difficulty

Fish difficulty is determined by `Player_Fishing_Force` — a lower value means the fish is **harder** to catch (the reel bar is more sensitive and the fight is more punishing).


Predatory fish (Pike, Trout, Blue Marlin) can **only** be caught with a Spinner lure. All others use Cheese or Worm on a Floater.

Each fish also has a `maxStrongSwimValue` that controls how many strong swims it makes before it can be caught, adding another layer of per-species behavior.

---

## Economy

```
   ┌──────────┐   buy bait   ┌──────────┐   catch fish  ┌──────────┐
   │          ├─────────────►│          ├──────────────►│          │
   │  COINS   │              │   BAIT   │               │   FISH   │
   │          │◄─────────────┤          │               │          │
   └──────────┘   sell fish  └──────────┘               └──────────┘
```

- Players start with **5 worms**.
- **Buying**: Bait is purchased at the shop. Transactions go through a Solana SPL token bridge for on-chain verification.
- **Selling**: Fish are sold from your backpack at the shop. Coins are added and an SPL token payout is requested.
- **Inventory**: All items (coins, bait counts, fish counts, gear) are synced to the server via PostgreSQL and persisted per-wallet.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Game Engine | Unity (C#) |
| Server | Node.js + Express + Socket.IO |
| Database | PostgreSQL |
| Blockchain | Solana (SPL tokens) |
| WebGL Networking | Socket.IO (JS) → Unity SendMessage bridge |
| Android Networking | SocketIOClient (C#) over WebSocket |
| Voice Chat | WAV 16 kHz mono, base64 over Socket.IO |
