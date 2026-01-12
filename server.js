/*
*@autor: Rio 3D Studios
*@description:  java script server that works as master server of the Basic Example of WebGL Multiplayer Kit
*/
const express  = require('express');//import express NodeJS framework module
const app      = express();// create an object of the express module
const http     = require('http').Server(app);// create a http web server using the http library
const io       = require('socket.io')(http);// import socketio communication module
const bs58 = require('bs58');
const { Connection, PublicKey, Keypair, Transaction, clusterApiUrl } = require('@solana/web3.js');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const {
	getAssociatedTokenAddress,
	createAssociatedTokenAccountInstruction,
	createTransferInstruction,
	TOKEN_PROGRAM_ID,
	ASSOCIATED_TOKEN_PROGRAM_ID
} = require('@solana/spl-token');
const { Pool } = require('pg');

app.use(express.json());
app.use("/public/TemplateData",express.static(__dirname + "/public/TemplateData"));
app.use("/public/Build",express.static(__dirname + "/public/Build"));
app.use(express.static(__dirname+'/public'));

var clients			= [];// to storage clients
var clientLookup = {};// clients search engine
var sockets = {};//// to storage sockets

const PORT = process.env.PORT || 3000;
const RPC_ENDPOINT = process.env.SOLANA_RPC || clusterApiUrl("mainnet-beta");
const TOKEN_MINT = process.env.TOKEN_MINT || process.env.SPL_TOKEN_MINT;
const VAULT_SECRET = process.env.WALLET_SEED || process.env.SPL_VAULT_SECRET || process.env.VAULT_SECRET_KEY || process.env.VAULT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
const connection = new Connection(RPC_ENDPOINT, "confirmed");

let vaultKeypair = null;
let vaultPublicKeyString = null;
let mintPublicKeyString = null;
if (VAULT_SECRET) {
	try {
		const maybeMnemonic = VAULT_SECRET.trim();
		if (maybeMnemonic.includes(" ")) {
			// Treat any space-separated input as mnemonic; derive and only fall back if derivation fails
			try {
				const seed = bip39.mnemonicToSeedSync(maybeMnemonic);
				const derived = derivePath(`m/44'/501'/0'/0'`, seed.toString('hex'));
				vaultKeypair = Keypair.fromSeed(Buffer.from(derived.key.slice(0, 32)));
				console.log("[SOL] Vault derived from WALLET_SEED mnemonic:", vaultKeypair.publicKey.toBase58());
			} catch (mnemonicErr) {
				console.error("[SOL] Failed to derive from WALLET_SEED mnemonic:", mnemonicErr.message);
			}
		}

		// If mnemonic path failed or no spaces, attempt base58 secret key
		if (!vaultKeypair) {
			vaultKeypair = Keypair.fromSecretKey(bs58.decode(VAULT_SECRET));
			console.log("[SOL] Vault loaded from secret key:", vaultKeypair.publicKey.toBase58());
		}
		vaultPublicKeyString = vaultKeypair.publicKey.toBase58();
	} catch (err) {
		console.error("[SOL] Failed to load vault secret key/mnemonic:", err.message);
	}
} else {
	console.warn("[SOL] No vault secret key set. Set WALLET_SEED (12-word mnemonic) or SPL_VAULT_SECRET / VAULT_SECRET_KEY in Heroku config.");
}

const ensureTokenMint = () => {
	if (!TOKEN_MINT) {
		throw new Error("SPL_TOKEN_MINT env var is missing");
	}
	return new PublicKey(TOKEN_MINT);
};

try {
	if (TOKEN_MINT) {
		mintPublicKeyString = ensureTokenMint().toBase58();
		console.log("[SOL] Mint set to:", mintPublicKeyString);
	}
	if (vaultPublicKeyString) {
		console.log("[SOL] Vault public key:", vaultPublicKeyString);
	}
} catch (err) {
	console.error("[SOL] Mint init error:", err.message);
}

async function buildAndSendPayout(destination, rawAmount) {
	if (!vaultKeypair) throw new Error("Vault keypair not configured");

	const mint = ensureTokenMint();
	const destinationPk = new PublicKey(destination);
	const vaultPk = vaultKeypair.publicKey;
	const vaultAta = await getAssociatedTokenAddress(mint, vaultPk, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
	const destAta = await getAssociatedTokenAddress(mint, destinationPk, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

	const rawAmountBig = BigInt(rawAmount);

	const instructions = [];

	// Log balances to help troubleshoot "no record of prior credit"
	let vaultBalLamports = null;
	let vaultBalUi = null;
	try {
		const vaultBal = await connection.getTokenAccountBalance(vaultAta);
		vaultBalLamports = vaultBal?.value?.amount ? BigInt(vaultBal.value.amount) : null;
		vaultBalUi = vaultBal?.value?.uiAmountString;
		console.log("[SOL] Vault ATA", vaultAta.toBase58(), "balance", vaultBalUi, "raw", vaultBal?.value?.amount);
	} catch (e) {
		console.log("[SOL] Vault ATA balance fetch failed (likely missing):", e.message);
	}

	const vaultAtaInfo = await connection.getAccountInfo(vaultAta);
	if (!vaultAtaInfo) {
		instructions.push(
			createAssociatedTokenAccountInstruction(vaultPk, vaultAta, vaultPk, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
		);
	}

	const destAtaInfo = await connection.getAccountInfo(destAta);
	if (!destAtaInfo) {
		instructions.push(
			createAssociatedTokenAccountInstruction(vaultPk, destAta, destinationPk, mint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
		);
	}

	if (vaultBalLamports !== null && vaultBalLamports < rawAmountBig) {
		console.error("[SOL] Vault token balance too low for payout. needed", rawAmountBig.toString(), "have", vaultBalLamports.toString());
		throw new Error("Vault token balance too low for payout");
	}

	instructions.push(
		createTransferInstruction(
			vaultAta,
			destAta,
			vaultPk,
			rawAmountBig,
			[],
			TOKEN_PROGRAM_ID
		)
	);

	const blockhash = await connection.getLatestBlockhash();
	const tx = new Transaction({
		feePayer: vaultPk,
		recentBlockhash: blockhash.blockhash
	});

	tx.add(...instructions);
	tx.sign(vaultKeypair);

	// Optional simulation to surface logs before sending
	try {
		const sim = await connection.simulateTransaction(tx, [vaultKeypair]);
		if (sim?.value?.err) {
			console.error("[SOL] Simulation error", sim.value.err, "logs", sim.value.logs);
			throw new Error("Simulation failed: " + JSON.stringify(sim.value.err));
		}
	} catch (simErr) {
		console.error("[SOL] simulateTransaction failed", simErr.message);
		throw simErr;
	}

	const serialized = tx.serialize();
	let signature = "";
	try {
		signature = await connection.sendRawTransaction(serialized);
	} catch (err) {
		console.error("[SOL] sendRawTransaction error", err);
		throw err;
	}

	await connection.confirmTransaction(
		{
			signature,
			blockhash: blockhash.blockhash,
			lastValidBlockHeight: blockhash.lastValidBlockHeight
		},
		"confirmed"
	);

	return signature;
}

// -------------------- Postgres Inventory Store --------------------
let pgPool = null;
if (DATABASE_URL) {
	try {
		pgPool = new Pool({
			connectionString: DATABASE_URL,
			ssl: { rejectUnauthorized: false }
		});
		console.log("[INV] Postgres pool created");
	} catch (err) {
		console.error("[INV] Failed to create Postgres pool:", err.message);
	}
} else {
	console.warn("[INV] DATABASE_URL not set; inventory persistence disabled.");
}

const ensureInventoryTable = async () => {
	if (!pgPool) return;
	const createSql = `
		CREATE TABLE IF NOT EXISTS player_inventory (
			wallet TEXT PRIMARY KEY,
			inventory JSONB NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`;
	await pgPool.query(createSql);
	console.log("[INV] player_inventory table ready");
};

const defaultInventory = () => ({
	coins: 100,
	rod: { owned: true },
	floater: { count: 1, used: true },
	spinner: { count: 0, used: false },
	worm: { count: 1, used: true },
	cheese: { count: 0, used: false },
	baits: { floaterUsed: true, spinnerUsed: false, wormUsed: true, cheeseUsed: false },
	backpack: { unlocked: true },
	fishStats: { catched: 0, bestSize: "00 cm", bestName: "" }
});

const getInventory = async (wallet) => {
	if (!pgPool) return { inventory: defaultInventory(), created: true };
	const res = await pgPool.query("SELECT inventory FROM player_inventory WHERE wallet=$1", [wallet]);
	if (res.rows.length === 0) {
		const inv = defaultInventory();
		await pgPool.query("INSERT INTO player_inventory (wallet, inventory) VALUES ($1, $2)", [wallet, inv]);
		console.log("[INV] Seeded new inventory for", wallet);
		return { inventory: inv, created: true };
	}
	return { inventory: res.rows[0].inventory, created: false };
};

const saveInventory = async (wallet, inventory) => {
	if (!pgPool) return;
	await pgPool.query(
		`INSERT INTO player_inventory (wallet, inventory) VALUES ($1, $2)
		 ON CONFLICT (wallet) DO UPDATE SET inventory = EXCLUDED.inventory, updated_at = NOW()`,
		[wallet, inventory]
	);
	console.log("[INV] Saved inventory for", wallet);
};

// init table
(async () => {
	try { await ensureInventoryTable(); } catch (e) { console.error("[INV] ensure table error", e.message); }
})();

app.get("/health", (_req, res) => {
	res.json({
		ok: true,
		mint: mintPublicKeyString,
		vault: vaultPublicKeyString,
		rpc: RPC_ENDPOINT
	});
});

app.get("/config", (_req, res) => {
	res.json({
		mint: mintPublicKeyString,
		vault: vaultPublicKeyString,
		rpc: RPC_ENDPOINT
	});
});

// Inventory REST API
app.get("/inventory/:wallet", async (req, res) => {
	const wallet = (req.params.wallet || "").trim();
	if (!wallet) return res.status(400).json({ error: "wallet required" });
	try {
		const result = await getInventory(wallet);
		res.json({ wallet, created: result.created, inventory: result.inventory });
	} catch (err) {
		console.error("[INV] fetch error", err);
		res.status(500).json({ error: err.message });
	}
});

app.post("/inventory", async (req, res) => {
	const { wallet, inventory } = req.body || {};
	if (!wallet || !inventory) return res.status(400).json({ error: "wallet and inventory required" });
	try {
		await saveInventory(wallet, inventory);
		res.json({ ok: true, wallet });
	} catch (err) {
		console.error("[INV] save error", err);
		res.status(500).json({ error: err.message });
	}
});

app.post("/payout", async (req, res) => {
	try {
		const { destination, amount, mint } = req.body || {};
		if (!destination || !amount) {
			return res.status(400).json({ error: "destination and amount are required" });
		}
		if (mint && TOKEN_MINT && mint !== TOKEN_MINT) {
			return res.status(400).json({ error: "mint mismatch" });
		}

		const numericAmount = Number(amount);
		if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
			return res.status(400).json({ error: "amount must be > 0" });
		}

		const signature = await buildAndSendPayout(destination, numericAmount);
		res.json({ signature });
	} catch (err) {
		console.error("[SOL] payout error", err);
		res.status(500).json({ error: err.message });
	}
});

//open a connection with the specific client
io.on('connection', function(socket){

   //print a log in node.js command prompt
  console.log('A user ready for connection!');
  
  //to store current client connection
  var currentUser;
	
	
	//create a callback fuction to listening EmitPing() method in NetworkMannager.cs unity script
	socket.on('PING', function (_pack)
	{
	  //console.log('_pack# '+_pack);
	  var pack = JSON.parse(_pack);	

	    console.log('message from user# '+socket.id+": "+pack.msg);
        
		 //emit back to NetworkManager in Unity by client.js script
		 socket.emit('PONG', socket.id,pack.msg);
		
	});
	
	//create a callback fuction to listening EmitJoin() method in NetworkMannager.cs unity script
	socket.on('LOGIN', function (_data)
	{
	
	    console.log('[INFO] JOIN received !!! ');
		
		var data = JSON.parse(_data);

         // fills out with the information emitted by the player in the unity
        currentUser = {
			       name:data.name,
                   posX:data.posX,
				   posY:data.posY,
				   posZ:data.posZ,
				   rotation:'0',
			       id:socket.id,//alternatively we could use socket.id
				   socketID:socket.id,//fills out with the id of the socket that was open
				   animation:""
				   };//new user  in clients list
					
		console.log('[INFO] player '+currentUser.name+': logged!');
		

		 //add currentUser in clients list
		 clients.push(currentUser);
		 
		 //add client in search engine
		 clientLookup[currentUser.id] = currentUser;

		 sockets[currentUser.socketID] = socket;//add curent user socket
		 
		 console.log('[INFO] Total players: ' + clients.length);
		 
		 /*********************************************************************************************/		
		
		//send to the client.js script
		socket.emit("LOGIN_SUCCESS",currentUser.id,currentUser.name,currentUser.posX,currentUser.posY,currentUser.posZ);
		// Send mint/vault info to the player on join
		socket.emit("MINT_VAULT", { mint: mintPublicKeyString, vault: vaultPublicKeyString, rpc: RPC_ENDPOINT });
		console.log("[SOL] Sent mint/vault to", currentUser.name, mintPublicKeyString, vaultPublicKeyString);
		
         //spawn all connected clients for currentUser client 
         clients.forEach( function(i) {
		    if(i.id!=currentUser.id)
			{ 
		      //send to the client.js script
		      socket.emit('SPAWN_PLAYER',i.id,i.name,i.posX,i.posY,i.posZ);
			  
		    }//END_IF
	   
	     });//end_forEach
		
		 // spawn currentUser client on clients in broadcast
		socket.broadcast.emit('SPAWN_PLAYER',currentUser.id,currentUser.name,currentUser.posX,currentUser.posY,currentUser.posZ);
		
  
	});//END_SOCKET_ON
	
	// Inventory fetch via socket
	socket.on('INVENTORY_FETCH', async function (_data) {
		try {
			const data = typeof _data === "string" ? JSON.parse(_data) : _data || {};
			const wallet = (data.wallet || "").trim();
			if (!wallet) return socket.emit("INVENTORY_ERROR", { error: "wallet required" });
			const result = await getInventory(wallet);
			socket.emit("INVENTORY_DATA", { wallet, created: result.created, inventory: result.inventory });
			console.log("[INV] Sent inventory for", wallet, "created?", result.created);
		} catch (err) {
			console.error("[INV] socket fetch error", err.message);
			socket.emit("INVENTORY_ERROR", { error: err.message });
		}
	});
	
	// Inventory save via socket
	socket.on('INVENTORY_SAVE', async function (_data) {
		try {
			const data = typeof _data === "string" ? JSON.parse(_data) : _data || {};
			const wallet = (data.wallet || "").trim();
			const inventory = data.inventory;
			if (!wallet || !inventory) return socket.emit("INVENTORY_ERROR", { error: "wallet and inventory required" });
			await saveInventory(wallet, inventory);
			socket.emit("INVENTORY_SAVE_OK", { ok: true, wallet });
			console.log("[INV] Inventory saved via socket for", wallet);
		} catch (err) {
			console.error("[INV] socket save error", err.message);
			socket.emit("INVENTORY_ERROR", { error: err.message });
		}
	});
	
	
	
		
	//create a callback fuction to listening EmitMoveAndRotate() method in NetworkMannager.cs unity script
	socket.on('MOVE_AND_ROTATE', function (_data)
	{
	  var data = JSON.parse(_data);	
	  
	  if(currentUser)
	  {
		
		  
	   currentUser.posX= data.posX;
	   currentUser.posY = data.posY;
	   currentUser.posZ = data.posZ;
	   
	   currentUser.rotation = data.rotation;
	  
	   // send current user position and  rotation in broadcast to all clients in game
       socket.broadcast.emit('UPDATE_MOVE_AND_ROTATE', currentUser.id,currentUser.posX,currentUser.posY,currentUser.posZ,currentUser.rotation);
      
       }
	});//END_SOCKET_ON
	
	
//create a callback fuction to listening EmitAnimation() method in NetworkMannager.cs unity script
	socket.on('ANIMATION', function (_data)
	{
	  var data = JSON.parse(_data);	
	  
	  if(currentUser)
	  {
	   
	   currentUser.timeOut = 0;
	   
	    //send to the client.js script
	   //updates the animation of the player for the other game clients
       socket.broadcast.emit('UPDATE_PLAYER_ANIMATOR', currentUser.id,data.key,data.value,data.type);
	
	   
      }//END_IF
	  
	});//END_SOCKET_ON
	
	

    // called when the user desconnect
	socket.on('disconnect', function ()
	{
     
	    if(currentUser)
		{
		 currentUser.isDead = true;
		 
		 //send to the client.js script
		 //updates the currentUser disconnection for all players in game
		 socket.broadcast.emit('USER_DISCONNECTED', currentUser.id);
		
		
		 for (var i = 0; i < clients.length; i++)
		 {
			if (clients[i].name == currentUser.name && clients[i].id == currentUser.id) 
			{

				console.log("User "+clients[i].name+" has disconnected");
				clients.splice(i,1);

			};
		};
		
		}
		
    });//END_SOCKET_ON
		
});//END_IO.ON


http.listen(PORT, function(){
	console.log('listening on *:' + PORT);
});
console.log("------- server is running -------");