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

	/* Voice chat (disabled for now)
	socket.on('SEND_USER_VOICE_INFO', function(id) {
	     var currentUserAtr = id+':'+'';	
		 
		 if(window.unityInstance!=null)
		{
		   window.unityInstance.SendMessage ('NetworkManager', 'OnUpdateUserVoiceInfo',currentUserAtr);
		}
		
	});//END_SOCKET.ON
	*/

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

/* Voice chat (disabled for now)
// Allow listening immediately, speaking only after user action.
var voiceIncomingMuted = false;
socket.on("UPDATE_VOICE", function (data) {
	if (voiceIncomingMuted) return;
	var audio = new Audio(data);
	audio.play();
});

var voiceChatStarted = false;
var voiceRecorder = null;
var voiceStream = null;

// Call this from a button to request mic permissions and start talking.
window.StartVoiceChat = function (time) {
	if (voiceChatStarted) return;
	voiceChatStarted = true;
	var chunkTime = Number(time) || 1000;

	navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
	  voiceStream = stream;
	  voiceRecorder = new MediaRecorder(stream);
	  voiceRecorder.start();
  
	  var audioChunks = [];
  
	  voiceRecorder.addEventListener("dataavailable", function (event) {
		audioChunks.push(event.data);
	  });
  
	  voiceRecorder.addEventListener("stop", function () {
		var audioBlob = new Blob(audioChunks);
  
		audioChunks = [];
  
		var fileReader = new FileReader();
		fileReader.readAsDataURL(audioBlob);
		fileReader.onloadend = function () {
		  var base64String = fileReader.result;
		  socket.emit("VOICE", base64String);
		};
  
		voiceRecorder.start();
  
		setTimeout(function () {
		  voiceRecorder.stop();
		}, chunkTime);
	  });
  
	  setTimeout(function () {
		voiceRecorder.stop();
	  }, chunkTime);
	}).catch(function (err) {
		voiceChatStarted = false;
		console.error("Microphone permission denied or error", err);
	});
};

// Optional: allow stopping mic capture later if needed.
window.StopVoiceChat = function () {
	if (voiceRecorder && voiceRecorder.state !== "inactive") {
		voiceRecorder.stop();
	}
	if (voiceStream) {
		voiceStream.getTracks().forEach(function (t) { t.stop(); });
	}
	voiceRecorder = null;
	voiceStream = null;
	voiceChatStarted = false;
};

// Toggle incoming voice playback.
window.SetVoiceChatMuted = function (isMuted) {
	voiceIncomingMuted = !!isMuted;
};
*/

