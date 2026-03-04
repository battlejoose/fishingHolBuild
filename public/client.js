var socket = io() || {};
socket.isReady = false;


window.addEventListener('load', function() {

	var execInUnity = function(method) {
		if (!socket.isReady) return;
		
		var args = Array.prototype.slice.call(arguments, 1);
		
		f(window.unityInstance!=null)
		{
		  //fit formats the message to send to the Unity client game, take a look in NetworkManager.cs in Unity
		  window.unityInstance.SendMessage("NetworkManager", method, args.join(':'));
		
		}
		
	};//END_exe_In_Unity 

	
	socket.on('PONG', function(socket_id,msg) {
				      		
	  var currentUserAtr = socket_id+':'+msg;
	  
	 if(window.unityInstance!=null)
		{
		 
		  window.unityInstance.SendMessage ('NetworkManager', 'OnPrintPongMsg', currentUserAtr);
		
		}
	  
	});//END_SOCKET.ON

					      
	socket.on('LOGIN_SUCCESS', function(id,name,posX,posY,posZ) {
				      		
	  var currentUserAtr = id+':'+name+':'+posX+':'+posY+':'+posZ;
	  
	   if(window.unityInstance!=null)
		{
		 
		  window.unityInstance.SendMessage ('NetworkManager', 'OnJoinGame', currentUserAtr);
		
		}
	  
	});//END_SOCKET.ON

// Cache login payload for reconnects without altering login flow
socket.on('LOGIN_SUCCESS', function(id,name,posX,posY,posZ) {
	var currentUserAtr = id+':'+name+':'+posX+':'+posY+':'+posZ;
	if(window.unityInstance!=null)
	{
		window.unityInstance.SendMessage ('NetworkManager', 'OnCacheLoginPayload', currentUserAtr);
	}
});//END_SOCKET.ON

// Notify Unity about socket connection state
socket.on('connect', function() {
	if(window.unityInstance!=null)
	{
		window.unityInstance.SendMessage('NetworkManager', 'OnSocketReconnected', '');
	}
});//END_SOCKET.ON

socket.on('disconnect', function(reason) {
	if(window.unityInstance!=null)
	{
		window.unityInstance.SendMessage('NetworkManager', 'OnSocketDisconnected', reason || 'disconnect');
	}
});//END_SOCKET.ON

	// Receive mint/vault config and forward to Unity
	socket.on('MINT_VAULT', function(data) {
		try {
			var payloadObj = data || {};
			// Do not log RPC endpoints; only forward mint/vault
			var payload = JSON.stringify({ mint: payloadObj.mint, vault: payloadObj.vault });
			if (window.unityInstance != null) {
				window.unityInstance.SendMessage('NetworkManager', 'OnMintVault', payload);
			}
		} catch (e) {
			console.error("Failed to handle MINT_VAULT", e);
		}
	});
	
		
	socket.on('SPAWN_PLAYER', function(id,name,posX,posY,posZ) {
	
	    var currentUserAtr = id+':'+name+':'+posX+':'+posY+':'+posZ;
		
		if(window.unityInstance!=null)
		{
	     // sends the package currentUserAtr to the method OnSpawnPlayer in the NetworkManager class on Unity
		  window.unityInstance.SendMessage ('NetworkManager', 'OnSpawnPlayer', currentUserAtr);
		
		}
		
	});//END_SOCKET.ON
	
	
	
    socket.on('UPDATE_MOVE_AND_ROTATE', function(id,posX,posY,posZ,rotation) {
		
	    var currentUserAtr = id+':'+posX+':'+posY+':'+posZ+':'+rotation;
		 	
		if(window.unityInstance!=null)
		{
		   window.unityInstance.SendMessage ('NetworkManager', 'OnUpdateMoveAndRotate',currentUserAtr);
		}
		
	});//END_SOCKET.ON
	
	
	socket.on('UPDATE_PLAYER_ANIMATOR', function(id,key,value,type) {
	
	     var currentUserAtr = id+':'+key+':'+value+':'+type;
		
		
		if(window.unityInstance!=null)
		{
	     // sends the package currentUserAtr to the method OnUpdateAnim in the NetworkManager class on Unity
		  window.unityInstance.SendMessage ('NetworkManager', 'OnUpdateAnim', currentUserAtr);
		
		}
		
	});//END_SOCKET.ON
	

		        
	socket.on('USER_DISCONNECTED', function(id) {
	
	     var currentUserAtr = id;
		 
		if(window.unityInstance!=null)
		{
		  
		 window.unityInstance.SendMessage ('NetworkManager', 'OnUserDisconnected', currentUserAtr);
		
		
		}
		 
	
	});//END_SOCKET.ON

	socket.on('SEND_USER_VOICE_INFO', function(id) {
	     var currentUserAtr = id+':'+'';	
		 
		 if(window.unityInstance!=null)
		{
		   window.unityInstance.SendMessage ('NetworkManager', 'OnUpdateUserVoiceInfo',currentUserAtr);
		}
		
	});//END_SOCKET.ON

	// Inventory responses to Unity
	socket.on('INVENTORY_DATA', function(payload) {
		try {
			if (window.unityInstance != null) {
				window.unityInstance.SendMessage('NetworkManager', 'OnInventoryData', JSON.stringify(payload));
			}
		} catch (e) {
			console.error("Failed to forward INVENTORY_DATA", e);
		}
	});

	// Expose simple JS helpers callable from Unity to request/save inventory
	window.RequestInventory = function(wallet) {
		if (!wallet) { console.error("RequestInventory requires wallet"); return; }
		socket.emit('INVENTORY_FETCH', { wallet: wallet });
	};

	window.SaveInventory = function(wallet, inventoryJson) {
		if (!wallet) { console.error("SaveInventory requires wallet"); return; }
		let parsed = null;
		try {
			parsed = typeof inventoryJson === "string" ? JSON.parse(inventoryJson) : inventoryJson;
		} catch (e) {
			console.error("SaveInventory invalid inventory JSON", e);
			return;
		}
		socket.emit('INVENTORY_SAVE', { wallet: wallet, inventory: parsed });
	};

// Reconnect helper callable from Unity
window.ReconnectAndLogin = function(name, posX, posY, posZ) {
	if (!name) { console.error("ReconnectAndLogin requires name"); return; }
	var payload = {
		name: name,
		posX: String(posX ?? 0),
		posY: String(posY ?? 0),
		posZ: String(posZ ?? 0)
	};
	var emitLogin = function () {
		try {
			socket.emit('LOGIN', JSON.stringify(payload));
		} catch (e) {
			console.error("ReconnectAndLogin emit failed", e);
		}
	};
	if (socket.connected) {
		emitLogin();
		return;
	}
	socket.once('connect', emitLogin);
	try {
		socket.connect();
	} catch (e) {
		console.error("ReconnectAndLogin connect failed", e);
	}
};

	socket.on('INVENTORY_SAVE_OK', function(payload) {
		try {
			if (window.unityInstance != null) {
				window.unityInstance.SendMessage('NetworkManager', 'OnInventorySaveOk', JSON.stringify(payload));
			}
		} catch (e) {
			console.error("Failed to forward INVENTORY_SAVE_OK", e);
		}
	});

	socket.on('INVENTORY_ERROR', function(payload) {
		try {
			if (window.unityInstance != null) {
				window.unityInstance.SendMessage('NetworkManager', 'OnInventoryError', JSON.stringify(payload));
			}
		} catch (e) {
			console.error("Failed to forward INVENTORY_ERROR", e);
		}
	});
	

});//END_window_addEventListener

// ===================== Voice Chat (WAV-based, cross-platform) =====================

var voiceIncomingMuted = false;
socket.on("UPDATE_VOICE", function (data) {
	if (voiceIncomingMuted) return;
	// Server rewrites the MIME to audio/ogg but actual bytes are always WAV.
	// Re-create the data URL with the correct MIME so the browser decodes it properly.
	var commaIdx = data.indexOf(',');
	if (commaIdx >= 0) {
		data = "data:audio/wav;base64," + data.substring(commaIdx + 1);
	}
	var audio = new Audio(data);
	audio.play();
});

var voiceChatStarted = false;
var voiceStream = null;
var voiceContext = null;
var voiceProcessor = null;
var voiceSource = null;
var voiceInterval = null;

function _voiceWriteString(view, offset, str) {
	for (var i = 0; i < str.length; i++) {
		view.setUint8(offset + i, str.charCodeAt(i));
	}
}

function _voiceEncodeWav(samples, sampleRate) {
	var numCh = 1, bps = 16;
	var dataSize = samples.length * 2;
	var buf = new ArrayBuffer(44 + dataSize);
	var v = new DataView(buf);
	_voiceWriteString(v, 0, 'RIFF');
	v.setUint32(4, 36 + dataSize, true);
	_voiceWriteString(v, 8, 'WAVE');
	_voiceWriteString(v, 12, 'fmt ');
	v.setUint32(16, 16, true);
	v.setUint16(20, 1, true);
	v.setUint16(22, numCh, true);
	v.setUint32(24, sampleRate, true);
	v.setUint32(28, sampleRate * numCh * 2, true);
	v.setUint16(32, numCh * 2, true);
	v.setUint16(34, bps, true);
	_voiceWriteString(v, 36, 'data');
	v.setUint32(40, dataSize, true);
	var off = 44;
	for (var i = 0; i < samples.length; i++) {
		var s = Math.max(-1, Math.min(1, samples[i]));
		v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
		off += 2;
	}
	return buf;
}

function _voiceArrayBufToBase64(buffer) {
	var bin = '', bytes = new Uint8Array(buffer);
	for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
	return btoa(bin);
}

function _voiceDownsample(buffer, fromRate, toRate) {
	if (fromRate === toRate || fromRate < toRate) return buffer;
	var ratio = fromRate / toRate;
	var len = Math.round(buffer.length / ratio);
	var out = new Float32Array(len);
	for (var i = 0; i < len; i++) {
		out[i] = buffer[Math.min(Math.round(i * ratio), buffer.length - 1)];
	}
	return out;
}

window.StartVoiceChat = function (time) {
	if (voiceChatStarted) return;
	voiceChatStarted = true;
	var chunkTime = Number(time) || 1000;
	var targetRate = 16000;

	navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
		voiceStream = stream;
		voiceContext = new (window.AudioContext || window.webkitAudioContext)();
		voiceSource = voiceContext.createMediaStreamSource(stream);
		voiceProcessor = voiceContext.createScriptProcessor(4096, 1, 1);

		var chunks = [];
		voiceSource.connect(voiceProcessor);
		voiceProcessor.connect(voiceContext.destination);

		voiceProcessor.onaudioprocess = function (e) {
			chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
		};

		voiceInterval = setInterval(function () {
			if (chunks.length === 0) return;
			var total = 0;
			for (var i = 0; i < chunks.length; i++) total += chunks[i].length;
			var merged = new Float32Array(total);
			var pos = 0;
			for (var i = 0; i < chunks.length; i++) {
				merged.set(chunks[i], pos);
				pos += chunks[i].length;
			}
			chunks = [];
			var down = _voiceDownsample(merged, voiceContext.sampleRate, targetRate);
			var wav = _voiceEncodeWav(down, targetRate);
			var b64 = _voiceArrayBufToBase64(wav);
			socket.emit("VOICE", "data:audio/wav;base64," + b64);
		}, chunkTime);
	}).catch(function (err) {
		voiceChatStarted = false;
		console.error("Microphone permission denied or error", err);
	});
};

window.StopVoiceChat = function () {
	if (voiceInterval) { clearInterval(voiceInterval); voiceInterval = null; }
	if (voiceProcessor) { voiceProcessor.disconnect(); voiceProcessor = null; }
	if (voiceSource) { voiceSource.disconnect(); voiceSource = null; }
	if (voiceContext) { voiceContext.close().catch(function(){}); voiceContext = null; }
	if (voiceStream) {
		voiceStream.getTracks().forEach(function (t) { t.stop(); });
		voiceStream = null;
	}
	voiceChatStarted = false;
};

window.SetVoiceChatMuted = function (isMuted) {
	voiceIncomingMuted = !!isMuted;
};

