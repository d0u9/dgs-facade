// const Matter = require('matter-js');

function mulberry32(a) {
	return function() {
		let t = a += 0x6D2B79F5;
		t = Math.imul(t ^ t >>> 15, t | 1);
		t ^= t + Math.imul(t ^ t >>> 7, t | 61);
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	}
}

const rand = mulberry32(Date.now());

const {
	Engine, Render, Runner, Composites, Common, MouseConstraint, Mouse,
	Composite, Bodies, Events,
} = Matter;

const wallPad = 64;
const loseHeight = 84;
// SITE PATCH: how long a fruit must stay above loseHeight before the game
// ends. Upstream ended it on the first contact above the line, which a fruit
// still falling from the spawn point, or one flung up by a merge, both trip.
const loseGraceMs = 1000;
// SITE PATCH: was 48, reserving room for the vendor's status bar, which is
// gone; the floor now sits on the bottom edge.
const statusBarHeight = 0;
const previewBallHeight = 32;
const friction = {
	friction: 0.006,
	frictionStatic: 0.006,
	frictionAir: 0,
	restitution: 0.1
};

const GameStates = {
	MENU: 0,
	READY: 1,
	DROP: 2,
	LOSE: 3,
};

const Game = {
	width: 640,
	// SITE PATCH: was 960, so the jar is a little over 6% deeper below the
	// mouth. The ratio stays close to upstream's on purpose: a board sized
	// from the viewport made the game easier on a deep screen than on a
	// shallow one. loseHeight and previewBallHeight are measured from the top
	// of the canvas and so still sit at the mouth; the walls and the floor
	// follow Game.height on their own.
	height: 1024,
	// SITE PATCH: the overlay score, the "Game Over!" card and the status bar
	// are the vendor's own chrome. This site's page supplies the HUD instead,
	// so these point at its ids and `ui`/`end` are gone.
	elements: {
		canvas: document.getElementById('game'),
		score: document.getElementById('score'),
		statusValue: document.getElementById('best'),
		message: document.getElementById('message'),
		nextFruitImg: document.getElementById('next'),
		previewBall: null,
	},
	cache: { highscore: 0 },
	sounds: {
		click: new Audio('/arcade/suika/assets/click.mp3'),
		pop0: new Audio('/arcade/suika/assets/pop0.mp3'),
		pop1: new Audio('/arcade/suika/assets/pop1.mp3'),
		pop2: new Audio('/arcade/suika/assets/pop2.mp3'),
		pop3: new Audio('/arcade/suika/assets/pop3.mp3'),
		pop4: new Audio('/arcade/suika/assets/pop4.mp3'),
		pop5: new Audio('/arcade/suika/assets/pop5.mp3'),
		pop6: new Audio('/arcade/suika/assets/pop6.mp3'),
		pop7: new Audio('/arcade/suika/assets/pop7.mp3'),
		pop8: new Audio('/arcade/suika/assets/pop8.mp3'),
		pop9: new Audio('/arcade/suika/assets/pop9.mp3'),
		pop10: new Audio('/arcade/suika/assets/pop10.mp3'),
	},
	// SITE PATCH: upstream called .play() bare. Before the first gesture iOS
	// rejects it, and an unhandled rejection per drop is noise; the sound is
	// not worth failing a drop over either.
	playSound: function (name) {
		const sound = Game.sounds[name];
		if (!sound) return;
		const played = sound.play();
		if (played) played.catch(() => {});
	},

	stateIndex: GameStates.MENU,

	score: 0,
	fruitsMerged: [],
	calculateScore: function () {
		const score = Game.fruitsMerged.reduce((total, count, sizeIndex) => {
			const value = Game.fruitSizes[sizeIndex].scoreValue * count;
			return total + value;
		}, 0);

		Game.score = score;
		Game.elements.score.innerText = Game.score;
	},

	fruitSizes: [
		{ radius: 24,  scoreValue: 1,  img: '/arcade/suika/assets/img/circle0.png'  },
		{ radius: 32,  scoreValue: 3,  img: '/arcade/suika/assets/img/circle1.png'  },
		{ radius: 40,  scoreValue: 6,  img: '/arcade/suika/assets/img/circle2.png'  },
		{ radius: 56,  scoreValue: 10, img: '/arcade/suika/assets/img/circle3.png'  },
		{ radius: 64,  scoreValue: 15, img: '/arcade/suika/assets/img/circle4.png'  },
		{ radius: 72,  scoreValue: 21, img: '/arcade/suika/assets/img/circle5.png'  },
		{ radius: 84,  scoreValue: 28, img: '/arcade/suika/assets/img/circle6.png'  },
		{ radius: 96,  scoreValue: 36, img: '/arcade/suika/assets/img/circle7.png'  },
		{ radius: 128, scoreValue: 45, img: '/arcade/suika/assets/img/circle8.png'  },
		{ radius: 160, scoreValue: 55, img: '/arcade/suika/assets/img/circle9.png'  },
		{ radius: 192, scoreValue: 66, img: '/arcade/suika/assets/img/circle10.png' },
	],
	currentFruitSize: 0,
	nextFruitSize: 0,
	setNextFruitSize: function () {
		Game.nextFruitSize = Math.floor(rand() * 5);
		Game.elements.nextFruitImg.src = `/arcade/suika/assets/img/circle${Game.nextFruitSize}.png`;
	},

	showHighscore: function () {
		Game.elements.statusValue.innerText = Game.cache.highscore;
	},
	// SITE PATCH: upstream kept a JSON blob under 'suika-game-cache'. The best
	// is now a plain number under the key the site's other games use, and a
	// blocked or full localStorage no longer throws the game down.
	loadHighscore: function () {
		try {
			Game.cache.highscore = Number(localStorage.getItem('d0u9-suika-best')) || 0;
		} catch (e) {}
		Game.showHighscore();
	},
	saveHighscore: function () {
		Game.calculateScore();
		if (Game.score <= Game.cache.highscore) return;

		Game.cache.highscore = Game.score;
		Game.showHighscore();
		Game.elements.message.innerText = 'new best'; // SITE PATCH: was the end card's title

		try {
			localStorage.setItem('d0u9-suika-best', String(Game.score));
		} catch (e) {}
	},

	// SITE PATCH: upstream opened on a menu screen and wired every listener
	// inside startGame, so a second game could only come from a page reload.
	// initGame now binds once, and newGame below resets the board.
	initGame: function () {
		Render.run(render);
		Game.runPhysics();

		Game.loadHighscore();
		Composite.add(engine.world, gameStatics);

		Events.on(mouseConstraint, 'mouseup', function (e) {
			Game.addFruit(e.mouse.position.x);
		});

		Events.on(mouseConstraint, 'mousemove', function (e) {
			if (Game.stateIndex !== GameStates.READY) return;
			if (Game.elements.previewBall === null) return;

			Game.elements.previewBall.position.x = e.mouse.position.x;
		});

		Events.on(engine, 'collisionStart', function (e) {
			for (let i = 0; i < e.pairs.length; i++) {
				const { bodyA, bodyB } = e.pairs[i];

				// Skip if collision is wall
				if (bodyA.isStatic || bodyB.isStatic) continue;

				// SITE PATCH: the lose check was here, on the first contact above
				// the line. Fruit spawns at y=32, so a size 0, 1 or 2 fruit sits
				// entirely above the line for the first stretch of its fall, and
				// a merge flings its neighbours up through it. Both ended the
				// game instantly. Game.checkLose below times the overflow
				// instead.

				// Skip different sizes
				if (bodyA.sizeIndex !== bodyB.sizeIndex) continue;

				// Skip if already popped
				if (bodyA.popped || bodyB.popped) continue;

				let newSize = bodyA.sizeIndex + 1;

				// Go back to smallest size
				if (bodyA.circleRadius >= Game.fruitSizes[Game.fruitSizes.length - 1].radius) {
					newSize = 0;
				}

				Game.fruitsMerged[bodyA.sizeIndex] += 1;

				// Therefore, circles are same size, so merge them.
				const midPosX = (bodyA.position.x + bodyB.position.x) / 2;
				const midPosY = (bodyA.position.y + bodyB.position.y) / 2;

				bodyA.popped = true;
				bodyB.popped = true;

				Game.playSound(`pop${bodyA.sizeIndex}`);
				Composite.remove(engine.world, [bodyA, bodyB]);
				Composite.add(engine.world, Game.generateFruitBody(midPosX, midPosY, newSize));
				Game.addPop(midPosX, midPosY, bodyA.circleRadius);
				Game.calculateScore();
			}
		});

		Game.newGame();
	},

	// SITE PATCH: replaces Runner.run. See the note on `runner` below.
	runPhysics: function () {
		var previous = null;
		requestAnimationFrame(function frame(time) {
			requestAnimationFrame(frame);

			if (previous === null || !runner.enabled) {
				previous = time;
				return;
			}

			// Clamped, so a frame lost to a background tab or a long paint
			// cannot step far enough to tunnel a fruit through a wall.
			var delta = Math.min(Math.max(time - previous, 1000 / 240), 1000 / 30);
			previous = time;
			Engine.update(engine, delta);
			Game.checkLose(delta);
		});
	},

	// SITE PATCH: clears the board and replays. Statics are kept, so the walls
	// survive; the preview ball is static too and so is removed by hand first.
	newGame: function () {
		Game.stateIndex = GameStates.MENU;

		if (Game.elements.previewBall !== null) {
			Composite.remove(engine.world, Game.elements.previewBall);
		}
		Composite.clear(engine.world, true);

		Game.score = 0;
		Game.overflowMs = 0;
		Game.fruitsMerged = Array.apply(null, Array(Game.fruitSizes.length)).map(() => 0);
		Game.currentFruitSize = 0;
		Game.setNextFruitSize();
		Game.calculateScore();
		Game.elements.message.innerText = 'ready';

		Game.elements.previewBall = Game.generateFruitBody(Game.width / 2, previewBallHeight, Game.currentFruitSize, {
			isStatic: true,
			collisionFilter: { mask: 0x0040 }
		});
		Composite.add(engine.world, Game.elements.previewBall);

		runner.enabled = true;
		document.dispatchEvent(new CustomEvent('suika:newgame'));
		setTimeout(() => {
			Game.stateIndex = GameStates.READY;
		}, 250);
	},

	addPop: function (x, y, r) {
		const circle = Bodies.circle(x, y, r, {
			isStatic: true,
			collisionFilter: { mask: 0x0040 },
			angle: rand() * (Math.PI * 2),
			render: {
				sprite: {
					texture: '/arcade/suika/assets/img/pop.png',
					xScale: r / 192, // SITE PATCH: was r / 384, for a 1024px texture
					yScale: r / 192,
				}
			},
		});

		Composite.add(engine.world, circle);
		setTimeout(() => {
			Composite.remove(engine.world, circle);
		}, 100);
	},

	// SITE PATCH: ends the game only once a fruit has been above the line
	// without a break for loseGraceMs. A fruit falling from the spawn point
	// clears the zone long before that, and one bounced up by a merge drops
	// back, so neither ends the game; a board that has genuinely filled to the
	// line does.
	overflowMs: 0,
	checkLose: function (delta) {
		if (Game.stateIndex !== GameStates.READY && Game.stateIndex !== GameStates.DROP) return;

		const bodies = Composite.allBodies(engine.world);
		let overflowing = false;
		for (let i = 0; i < bodies.length; i++) {
			const body = bodies[i];
			// Statics are the walls, the preview ball and the pop rings.
			if (body.isStatic || typeof body.sizeIndex !== 'number') continue;
			if (body.position.y + body.circleRadius < loseHeight) { overflowing = true; break; }
		}

		Game.overflowMs = overflowing ? Game.overflowMs + delta : 0;
		if (Game.overflowMs >= loseGraceMs) Game.loseGame();
	},

	loseGame: function () {
		Game.stateIndex = GameStates.LOSE;
		Game.elements.message.innerText = 'game over'; // SITE PATCH: was the end card
		runner.enabled = false;
		Game.saveHighscore();
		// SITE PATCH: the page draws its own game-over panel from this.
		document.dispatchEvent(new CustomEvent('suika:lose', { detail: { score: Game.score } }));
	},

	// Returns an index, or null
	lookupFruitIndex: function (radius) {
		const sizeIndex = Game.fruitSizes.findIndex(size => size.radius == radius);
		if (sizeIndex === undefined) return null;
		if (sizeIndex === Game.fruitSizes.length - 1) return null;

		return sizeIndex;
	},

	generateFruitBody: function (x, y, sizeIndex, extraConfig = {}) {
		const size = Game.fruitSizes[sizeIndex];
		// SITE PATCH: the textures were 1024x1024 whatever the fruit, so every
		// frame scaled each one down to between 48 and 384 pixels, and the set
		// held 48MB of decoded pixels. Each is now stored at the diameter it is
		// drawn at, which is all the 640x960 canvas can resolve, so the scale
		// is 1.
		const circle = Bodies.circle(x, y, size.radius, {
			...friction,
			...extraConfig,
			render: { sprite: { texture: size.img, xScale: 1, yScale: 1 } },
		});
		circle.sizeIndex = sizeIndex;
		circle.popped = false;

		return circle;
	},

	addFruit: function (x) {
		if (Game.stateIndex !== GameStates.READY) return;

		Game.playSound('click');

		Game.stateIndex = GameStates.DROP;
		const latestFruit = Game.generateFruitBody(x, previewBallHeight, Game.currentFruitSize);
		Composite.add(engine.world, latestFruit);

		Game.currentFruitSize = Game.nextFruitSize;
		Game.setNextFruitSize();
		Game.calculateScore();

		Composite.remove(engine.world, Game.elements.previewBall);
		Game.elements.previewBall = Game.generateFruitBody(render.mouse.position.x, previewBallHeight, Game.currentFruitSize, {
			isStatic: true,
			collisionFilter: { mask: 0x0040 }
		});

		setTimeout(() => {
			if (Game.stateIndex === GameStates.DROP) {
				Composite.add(engine.world, Game.elements.previewBall);
				Game.stateIndex = GameStates.READY;
			}
		}, 500);
	}
}; // SITE PATCH: upstream left this declaration unterminated

const engine = Engine.create();
// SITE PATCH: Runner.tick clamps its timestep to a 16.666ms floor and then
// steps once per animation frame, so a 120Hz display advances 16.666ms of
// physics 120 times a second: the board falls at twice speed and does twice the
// work, and 144Hz makes it 2.4x. Stepping by the real frame delta instead keeps
// one second of physics in one second on any display. `runner` is kept because
// loseGame and newGame freeze the board through `runner.enabled`.
const runner = Runner.create();
const render = Render.create({
	element: Game.elements.canvas,
	engine,
	options: {
		width: Game.width,
		height: Game.height,
		wireframes: false,
		background: '#080f14' // SITE PATCH: was the vendor's cream '#ffdcae'
	}
});

// SITE PATCH: menuStatics removed along with the menu screen.

const wallProps = {
	isStatic: true,
	render: { fillStyle: '#132029' }, // SITE PATCH: was the vendor's cream '#FFEEDB'
	...friction,
};

const gameStatics = [
	// Left
	Bodies.rectangle(-(wallPad / 2), Game.height / 2, wallPad, Game.height, wallProps),

	// Right
	Bodies.rectangle(Game.width + (wallPad / 2), Game.height / 2, wallPad, Game.height, wallProps),

	// Bottom
	Bodies.rectangle(Game.width / 2, Game.height + (wallPad / 2) - statusBarHeight, Game.width, wallPad, wallProps),
];

// add mouse control
const mouse = Mouse.create(render.canvas);
const mouseConstraint = MouseConstraint.create(engine, {
	mouse: mouse,
	collisionFilter: { mask: 0 }, // SITE PATCH: upstream let you drag fruit
	constraint: {
		stiffness: 0.2,
		render: {
			visible: false,
		},
	},
});
render.mouse = mouse;

// SITE PATCH: Matter preventDefaults the wheel on its element, which would
// pin the page's scroll-snap to the board.
render.canvas.removeEventListener('mousewheel', mouse.mousewheel);
render.canvas.removeEventListener('DOMMouseScroll', mouse.mousewheel);

Game.initGame();

// SITE PATCH: the page's restart button has no other way in.
window.suikaNewGame = Game.newGame;

// SITE PATCH: resizeCanvas removed; /arcade-shell.css sizes the canvas and
// Matter maps pointer coordinates through the CSS scale on its own.
