const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// 🔥 IMPORTANTE PRO RENDER: Usar a porta que o Render dá ou a 3001 localmente
const PORT = process.env.PORT || 3001;

// 🔥 ROTA BÁSICA (Health Check) - É isto que vai aparecer no navegador
app.get('/', (req, res) => {
    res.send('Servidor MMORPG online 🚀 - Para jogar, abre o teu Frontend!');
});

const gerarId = () => Math.random().toString(36).substring(2, 9);

let jogadores = {};
let slimes = [];
let faseAtual = 0;

function gerarSlimesFase() {
    slimes = [];
    if (faseAtual === 0 || faseAtual === 5) return;

    let numJogadores = Math.max(1, Object.keys(jogadores).length);

    if (faseAtual <= 3) {
        let quantidade = faseAtual * 2 * numJogadores;
        for (let i = 0; i < quantidade; i++) {
            slimes.push({
                id: gerarId(), x: Math.floor(Math.random() * 600) + 100, y: Math.floor(Math.random() * 400) + 100,
                vivo: true, vida: 40 * numJogadores, maxVida: 40 * numJogadores,
                isBoss: false, ultimoAtaque: Date.now()
            });
        }
    } else if (faseAtual === 4) {
        slimes.push({
            id: gerarId(), x: 400, y: 300, vivo: true, vida: 1500 * numJogadores, maxVida: 1500 * numJogadores,
            isBoss: true, ultimoAtaque: Date.now()
        });
    }
    io.emit('slimesAtuais', slimes);
}

io.on('connection', (socket) => {
    console.log(`Alguém conectou: ${socket.id}`);

    socket.on('entrarJogo', (dados = {}) => {
        jogadores[socket.id] = {
            id: socket.id, x: 400, y: 300,
            nome: dados.nome || 'Jogador', classe: dados.classe || 'guerreiro',
            nivel: 1, xp: 0, vida: 100, maxVida: 100, morto: false, direcao: 'baixo'
        };

        socket.emit('jogadoresAtuais', jogadores);
        socket.broadcast.emit('novoJogador', jogadores[socket.id]);
        socket.emit('faseAtualizada', faseAtual);

        if (slimes.length > 0) {
            socket.emit('slimesAtuais', slimes);
        }

        io.emit('chatNovaMensagem', { autor: 'SISTEMA', texto: `${jogadores[socket.id].nome} entrou!`, cor: '#00ff00' });
    });

    socket.on('entrarCaverna', () => {
        if (faseAtual === 0) {
            faseAtual = 1;
            gerarSlimesFase();
        }
        io.emit('faseAtualizada', faseAtual);
        if (jogadores[socket.id]) {
            jogadores[socket.id].x = 400;
            jogadores[socket.id].y = 500;
            io.emit('jogadorMoveu', jogadores[socket.id]);
        }
    });

    socket.on('chatMensagem', (texto) => {
        if (jogadores[socket.id]) io.emit('chatNovaMensagem', { autor: jogadores[socket.id].nome, texto: texto, cor: '#ffffff' });
    });

    socket.on('atirarMagia', (dados) => socket.broadcast.emit('novaMagia', dados));
    socket.on('ataqueGuerreiro', (dados) => socket.broadcast.emit('outroAtaqueGuerreiro', dados));

    socket.on('movimentoJogador', (dados) => {
        if (jogadores[socket.id] && !jogadores[socket.id].morto) {
            jogadores[socket.id].x = dados.x; jogadores[socket.id].y = dados.y; jogadores[socket.id].direcao = dados.direcao;
            socket.broadcast.emit('jogadorMoveu', jogadores[socket.id]);
        }
    });

    socket.on('falarComNPC', () => {
        if (faseAtual === 0) { faseAtual = 1; gerarSlimesFase(); io.emit('faseAtualizada', faseAtual); }
    });

    socket.on('atacarSlime', (idSlime) => {
        let jogador = jogadores[socket.id];
        let slime = slimes.find(s => s.id === idSlime);

        if (jogador && !jogador.morto && slime && slime.vivo) {
            let dano = 15 + (jogador.nivel * 5);
            if (jogador.classe === 'guerreiro') dano += 10;
            slime.vida -= dano;

            if (slime.vida <= 0) {
                slime.vida = 0; slime.vivo = false;
                jogador.xp += slime.isBoss ? 200 : 30;

                let xpNecessario = 50 * jogador.nivel;
                if (jogador.xp >= xpNecessario) {
                    jogador.nivel += 1; jogador.xp -= xpNecessario; jogador.maxVida += 20;
                    jogador.vida = Math.min(jogador.maxVida, jogador.vida + 5);
                    io.emit('chatNovaMensagem', { autor: 'SISTEMA', texto: `${jogador.nome} subiu para Lv.${jogador.nivel}!`, cor: '#ffff00' });
                }
                io.emit('jogadorAtualizado', jogador);

                if (slimes.every(s => !s.vivo)) {
                    Object.values(jogadores).forEach(j => { if (!j.morto) { j.vida = Math.min(j.maxVida, j.vida + 10); io.emit('jogadorAtualizado', j); } });
                    if (faseAtual < 4) { faseAtual++; setTimeout(() => { gerarSlimesFase(); io.emit('faseAtualizada', faseAtual); }, 3000); }
                    else if (faseAtual === 4) { faseAtual = 5; setTimeout(() => { io.emit('faseAtualizada', faseAtual); }, 3000); }
                }
            }
        }
    });

    socket.on('reiniciarJogo', () => {
        faseAtual = 0;
        slimes = [];
        Object.values(jogadores).forEach(j => {
            j.vida = j.maxVida;
            j.morto = false;
            j.x = 400; j.y = 300;
        });
        io.emit('jogoReiniciado');
        io.emit('faseAtualizada', faseAtual);
        io.emit('jogadoresAtuais', jogadores);
        io.emit('slimesAtuais', slimes);
        io.emit('chatNovaMensagem', { autor: 'SISTEMA', texto: 'A Caverna foi reiniciada. Boa sorte!', cor: '#ffff00' });
    });

    socket.on('disconnect', () => {
        if (jogadores[socket.id]) {
            io.emit('chatNovaMensagem', { autor: 'SISTEMA', texto: `${jogadores[socket.id].nome} fugiu.`, cor: '#ff0000' });
            delete jogadores[socket.id];
            io.emit('jogadorDesconectado', socket.id);
        }
    });
});

setInterval(() => {
    let agora = Date.now();
    slimes.forEach(slime => {
        if (slime.vivo) {
            if (!slime.isBoss) { slime.x += (Math.random() - 0.5) * 20; slime.y += (Math.random() - 0.5) * 20; }
            slime.x = Math.max(50, Math.min(750, slime.x)); slime.y = Math.max(50, Math.min(550, slime.y));

            if (!slime.isBoss && agora - slime.ultimoAtaque > 2000) {
                slime.ultimoAtaque = agora;
                io.emit('avisoAtaque', { x: slime.x, y: slime.y, raio: 70, tempo: 600 });
                setTimeout(() => { if (!slime.vivo) return; io.emit('efeitoAoE', { x: slime.x, y: slime.y, raio: 70, cor: 0x0088ff }); aplicarDanoArea(slime.x, slime.y, 70, 15); }, 600);
            }

            if (slime.isBoss && agora - slime.ultimoAtaque > 2500) {
                slime.ultimoAtaque = agora;
                let padrao = Math.floor(Math.random() * 3);
                if (padrao === 0) {
                    io.emit('avisoAtaque', { x: slime.x, y: slime.y, raio: 180, tempo: 1000 });
                    setTimeout(() => { if (!slime.vivo) return; io.emit('efeitoAoE', { x: slime.x, y: slime.y, raio: 180, cor: 0xff0000 }); aplicarDanoArea(slime.x, slime.y, 180, 40); }, 1000);
                } else if (padrao === 1) {
                    let vivos = Object.values(jogadores).filter(j => !j.morto);
                    let alvo = vivos.length > 0 ? vivos[Math.floor(Math.random() * vivos.length)] : slime;
                    io.emit('avisoAtaque', { x: alvo.x, y: alvo.y, raio: 120, tempo: 800 });
                    setTimeout(() => { if (!slime.vivo) return; slime.x = alvo.x; slime.y = alvo.y; io.emit('efeitoAoE', { x: alvo.x, y: alvo.y, raio: 120, cor: 0xff4400 }); aplicarDanoArea(alvo.x, alvo.y, 120, 50); io.emit('slimesMovimento', slimes); }, 800);
                } else {
                    for (let i = 0; i < 3; i++) {
                        let rx = Math.random() * 600 + 100; let ry = Math.random() * 400 + 100;
                        io.emit('avisoAtaque', { x: rx, y: ry, raio: 90, tempo: 1200 });
                        setTimeout(() => { if (!slime.vivo) return; io.emit('efeitoAoE', { x: rx, y: ry, raio: 90, cor: 0xaa00ff }); aplicarDanoArea(rx, ry, 90, 35); }, 1200);
                    }
                }
            }
        }
    });
    io.emit('slimesMovimento', slimes);
}, 100);

function aplicarDanoArea(x, y, raio, dano) {
    Object.values(jogadores).forEach(jogador => {
        if (!jogador.morto && Math.hypot(jogador.x - x, jogador.y - y) < raio) { jogador.vida -= dano; verificarMorte(jogador); }
    });
}

function verificarMorte(jogador) {
    if (jogador.vida <= 0) {
        jogador.vida = 0; jogador.morto = true;
        if (Object.values(jogadores).every(j => j.morto)) io.emit('gameOver');
    }
    io.emit('jogadorAtualizado', jogador);
}

// 🔥 INICIAR O SERVIDOR COM A PORTA DO RENDER
server.listen(PORT, () => { 
    console.log(`Servidor MMORPG a correr na porta ${PORT}!`); 
});