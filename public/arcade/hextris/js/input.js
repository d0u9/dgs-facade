function addKeyListeners() {
	keypress.register_combo({
		keys: "left",
		on_keydown: function() {
			if (MainHex && gameState !== 0) {
				MainHex.rotate(1);
			}
		}
	});

	keypress.register_combo({
		keys: "right",
		on_keydown: function() {
			if (MainHex && gameState !== 0){
				MainHex.rotate(-1);
			}
		}
	});
		keypress.register_combo({
		keys: "down",
		on_keydown: function() {
			var tempSpeed = settings.speedModifier;
			if (MainHex && gameState !== 0){
				//speed up block temporarily
				if(settings.speedUpKeyHeld == false){
					settings.speedUpKeyHeld = true;
					window.rush *=4;
				}
			}
			//settings.speedModifier = tempSpeed;
		},
		on_keyup:function(){
			if (MainHex && gameState !== 0){
				//speed up block temporarily
				
				window.rush /=4;
				settings.speedUpKeyHeld = false;
			}
		}	
	});
	
	keypress.register_combo({
		keys: "a",
		on_keydown: function() {
			if (MainHex && gameState !== 0) {
				MainHex.rotate(1);
			}
		}
	});

	keypress.register_combo({
		keys: "d",
		on_keydown: function() {
			if (MainHex && gameState !== 0){
				MainHex.rotate(-1);
			}
		}
	});
	
	keypress.register_combo({
		keys: "s",
		on_keydown: function() {
			var tempSpeed = settings.speedModifier;
			if (MainHex && gameState !== 0){
				//speed up block temporarily
				if(settings.speedUpKeyHeld == false){
					settings.speedUpKeyHeld = true;
					window.rush *=4;
				}
			}
			//settings.speedModifier = tempSpeed;
		},
		on_keyup:function(){
			if (MainHex && gameState !== 0){
				//speed up block temporarily
				
				window.rush /=4;
				settings.speedUpKeyHeld = false;
			}
		}	
	});
	keypress.register_combo({
		keys: "p",
		on_keydown: function(){pause();}
	});

	keypress.register_combo({
		keys: "space",
		on_keydown: function(){pause();}
	});

	keypress.register_combo({
		keys: "q",
		on_keydown: function() {
			if (devMode) toggleDevTools();
		}
	});

	keypress.register_combo({
		keys: "enter",
		on_keydown: function() {
			if (gameState==1 || importing == 1) {
				init(1);
			}
			if (gameState == 2) {
				init();
				$("#gameoverscreen").fadeOut();
			}
			if (gameState===0) {
				resumeGame();
			}
		}
	});

	$("#pauseBtn").on('touchstart mousedown', function() {
		if (gameState != 1 && gameState != -1) {
			return;
		}

		if ($('#helpScreen').is(":visible")) {
			$('#helpScreen').fadeOut(150, "linear");
		}
		pause();
		return false;
	});

	// #openSideBar (help) previously had no click handler of its own: it sat
	// directly on the canvas and only worked because clicks on it bubbled up
	// to document.body's handleClick/handleTap, which treated the top-left
	// corner of the stage as a fixed hit zone for showHelp(). Now that it's a
	// real button in the external control strip, it needs its own binding.
	$("#openSideBar").on('touchstart mousedown', function() {
		showHelp();
		return false;
	});

	// #colorBlindBtn isn't in this site's markup, so this handler never fires —
	// kept in sync with initialization.js's palette anyway in case it's ever
	// wired back up.
	$("#colorBlindBtn").on('touchstart mousedown', function() {
	window.colors = ["#25f4ee", "#fe2c55", "#fff01f", "#b026ff"];

	window.hexColorsToTintedColors = {
		"#25f4ee": "rgb(168,251,248)",
		"#fe2c55": "rgb(255,171,187)",
		"#fff01f": "rgb(255,249,165)",
		"#b026ff": "rgb(223,168,255)"
	};

	window.rgbToHex = {
		"rgb(37,244,238)": "#25f4ee",
		"rgb(254,44,85)": "#fe2c55",
		"rgb(255,240,31)": "#fff01f",
		"rgb(176,38,255)": "#b026ff"
	};

	window.rgbColorsToTintedColors = {
		"rgb(37,244,238)": "rgb(168,251,248)",
		"rgb(254,44,85)": "rgb(255,171,187)",
		"rgb(255,240,31)": "rgb(255,249,165)",
		"rgb(176,38,255)": "rgb(223,168,255)"
	};
	});


	if(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
			$("#restart").on('touchstart', function() {
			init();
			canRestart = false;
			$("#gameoverscreen").fadeOut();
		});

	}
	else {
		$("#restart").on('mousedown', function() {
			init();
			canRestart = false;
			$("#gameoverscreen").fadeOut();
		});

	}
	if(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
			$("#restartBtn").on('touchstart', function() {
			init(1);
			canRestart = false;
			$("#gameoverscreen").fadeOut();
		});

	}
	else {
		$("#restartBtn").on('mousedown', function() {
			init(1);
			canRestart = false;
			$("#gameoverscreen").fadeOut();
		});


	}

}
function inside (point, vs) {
	// ray-casting algorithm based on
	// http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html
	
	var x = point[0], y = point[1];
	
	var inside = false;
	for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
		var xi = vs[i][0], yi = vs[i][1];
		var xj = vs[j][0], yj = vs[j][1];
		
		var intersect = ((yi > y) != (yj > y))
			&& (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
		if (intersect) inside = !inside;
	}
	
	return inside;
};

function handleClickTap(x,y) {
	var stage = document.getElementById('hextris-stage');
	var stageRect = stage.getBoundingClientRect();
	x -= stageRect.left;
	y -= stageRect.top;
	if (x < 0 || y < 0 || x > stageRect.width || y > stageRect.height) return;
	// The help icon used to sit inside this top-left corner of the canvas, so taps
	// there were routed to showHelp(). It now lives in the external control strip
	// (site integration layout) with its own click handler, so this dead zone is
	// removed and the corner behaves like the rest of the play surface.
	var radius = settings.hexWidth ;
	var halfRadius = radius/2;
	var triHeight = radius *(Math.sqrt(3)/2);
	var Vertexes =[
		[radius,0],
		[halfRadius,-triHeight],
		[-halfRadius,-triHeight],
		[-radius,0],
		[-halfRadius,triHeight],
		[halfRadius,triHeight]];
	Vertexes = Vertexes.map(function(coord){ 
		return [coord[0] + trueCanvas.width/2, coord[1] + trueCanvas.height/2]});

	if (!MainHex || gameState === 0 || gameState==-1) {
		return;
	}

	if (x < trueCanvas.width/2) {
		MainHex.rotate(1);
	}
	if (x > trueCanvas.width/2) {
		MainHex.rotate(-1);
	}
}
