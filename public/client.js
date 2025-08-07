var socket = io() || {};
socket.isReady = false;


window.addEventListener('load', function() {

	var execInUnity = function(method) {
		if (!socket.isReady) return;
		
		var args = Array.prototype.slice.call(arguments, 1);
		
		if(window.unityInstance!=null)
		{
		  //fit formats the message to send to the Unity client game, take a look in FishingManager.cs in Unity
		  window.unityInstance.SendMessage("FishingManager", method, args.join(':'));
		
		}
		
	};//END_exe_In_Unity 

	
	socket.on('PONG', function(socket_id,msg) {
				      		
	  var currentUserAtr = socket_id+':'+msg;
	  
	 if(window.unityInstance!=null)
		{
		 
		  window.unityInstance.SendMessage ('FishingManager', 'OnPrintPongMsg', currentUserAtr);
		
		}
	  
	});//END_SOCKET.ON

					      
	socket.on('LOGIN_SUCCESS', function(id,name,posX,posY,posZ) {
				      		
	  var currentUserAtr = id+':'+name+':'+posX+':'+posY+':'+posZ;
	  
	   if(window.unityInstance!=null)
		{
		 
		  window.unityInstance.SendMessage ('FishingManager', 'OnJoinGame', currentUserAtr);
		
		}
	  
	});//END_SOCKET.ON
	
		
	socket.on('SPAWN_PLAYER', function(id,name,posX,posY,posZ) {
	
	    var currentUserAtr = id+':'+name+':'+posX+':'+posY+':'+posZ;
		
		if(window.unityInstance!=null)
		{
	     // sends the package currentUserAtr to the method OnSpawnPlayer in the FishingManager class on Unity
		  window.unityInstance.SendMessage ('FishingManager', 'OnSpawnPlayer', currentUserAtr);
		
		}
		
	});//END_SOCKET.ON
	
	
	
    socket.on('UPDATE_MOVE_AND_ROTATE', function(id,posX,posY,posZ,rotation) {
		
	    var currentUserAtr = id+':'+posX+':'+posY+':'+posZ+':'+rotation;
		 	
		if(window.unityInstance!=null)
		{
		   window.unityInstance.SendMessage ('FishingManager', 'OnUpdateMoveAndRotate',currentUserAtr);
		}
		
	});//END_SOCKET.ON
	
	
	socket.on('UPDATE_PLAYER_ANIMATOR', function(id,key,value,type) {
	
	     var currentUserAtr = id+':'+key+':'+value+':'+type;
		
		
		if(window.unityInstance!=null)
		{
	     // sends the package currentUserAtr to the method OnUpdateAnim in the FishingManager class on Unity
		  window.unityInstance.SendMessage ('FishingManager', 'OnUpdateAnim', currentUserAtr);
		
		}
		
	});//END_SOCKET.ON
	

		        
	socket.on('USER_DISCONNECTED', function(id) {
	
	     var currentUserAtr = id;
		 
		if(window.unityInstance!=null)
		{
		  
		 window.unityInstance.SendMessage ('FishingManager', 'OnUserDisconnected', currentUserAtr);
		
		
		}
		 
	
	});//END_SOCKET.ON
	

});//END_window_addEventListener



window.onload = (e) => {
	mainFunction(1000);
  };
  
  
  function mainFunction(time) {
  
  
	navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
	  var madiaRecorder = new MediaRecorder(stream);
	  madiaRecorder.start();
  
	  var audioChunks = [];
  
	  madiaRecorder.addEventListener("dataavailable", function (event) {
		audioChunks.push(event.data);
	  });
  
	  madiaRecorder.addEventListener("stop", function () {
		var audioBlob = new Blob(audioChunks);
  
		audioChunks = [];
  
		var fileReader = new FileReader();
		fileReader.readAsDataURL(audioBlob);
		fileReader.onloadend = function () {
   
  
		  var base64String = fileReader.result;
		  socket.emit("VOICE", base64String);
  
		};
  
		madiaRecorder.start();
  
  
		setTimeout(function () {
		  madiaRecorder.stop();
		}, time);
	  });
  
	  setTimeout(function () {
		madiaRecorder.stop();
	  }, time);
	});
  
  
   socket.on("UPDATE_VOICE", function (data) {
	  var audio = new Audio(data);
	  audio.play();
	});
	
	
  }

