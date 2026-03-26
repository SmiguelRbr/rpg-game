const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();

// 🔥 IMPORTANTE PRO RENDER
const PORT = process.env.PORT || 3001;

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// rota básica (health check)
app.get('/', (req, res) => {
    res.send('Servidor MMORPG online 🚀');
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
                id: gerarId(),
                x: Math.random() * 600 + 100,
                y: Math.random() * 400 + 100,
                vivo: true,
                vida: 40 * numJogadores,
                maxVida: 40 * numJogadores,
                isBoss: false,
                ultimoAtaque: Date.now()
            });
        }

    } else if (faseAtual === 4) {
        slimes.push({
            id: gerarId(),
            x: 400,
            y: 300,
            vivo: true,
            vida: 1500 * numJogadores,
            maxVida: 1500 * numJogadores,
            isBoss: true,
            ultimoAtaque: Date.now()
        });
    }

    io.emit('slimesAtuais', slimes);
}

io.on('connection', (socket) => {
    console.log(`Conectou: ${socket.id}`);

    socket.on('entrarJogo', (dados = {}) => {
        jogadores[socket.id] = {
            id: socket.id,
            x: 400,
            y: 300,
            nome: dados.nome || 'Jogador',
            classe: dados.classe || 'mago',
            nivel: 1,
            xp: 0,
            vida: 100,
            maxVida: 100,
            morto: false,
            direcao: 'baixo'
        };

        socket.emit('jogadoresAtuais', jogadores);
        socket.broadcast.emit('novoJogador', jogadores[socket.id]);
        socket.emit('faseAtualizada', faseAtual);

        if (slimes.length > 0) {
            socket.emit('slimesAtuais', slimes);
        }

        io.emit('chatNovaMensagem', {
            autor: 'SISTEMA',
            texto: `${jogadores[socket.id].nome} entrou!`,
            cor: '#00ff00'
        });
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
        if (jogadores[socket.id]) {
            io.emit('chatNovaMensagem', {
                autor: jogadores[socket.id].nome,
                texto,
                cor: '#ffffff'
            });
        }
    });

    socket.on('atirarMagia', (dados) => socket.broadcast.emit('novaMagia', dados));
    socket.on('ataqueGuerreiro', (dados) => socket.broadcast.emit('outroAtaqueGuerreiro', dados));

    socket.on('movimentoJogador', (dados) => {
        if (jogadores[socket.id] && !jogadores[socket.id].morto) {
            jogadores[socket.id].x = dados.x;
            jogadores[socket.id].y = dados.y;
            jogadores[socket.id].direcao = dados.direcao;

            socket.broadcast.emit('jogadorMoveu', jogadores[socket.id]);
        }
    });

    socket.on('falarComNPC', () => {
        if (faseAtual === 0) {
            faseAtual = 1;
            gerarSlimesFase();
            io.emit('faseAtualizada', faseAtual);
        }
    });

    socket.on('atacarSlime', (idSlime) => {
        let jogador = jogadores[socket.id];
        let slime = slimes.find(s => s.id === idSlime);

        if (!jogador || jogador.morto || !slime || !slime.vivo) return;

        let dano = 15 + (jogador.nivel * 5);
        if (jogador.classe === 'guerreiro') dano += 10;

        slime.vida -= dano;

        if (slime.vida <= 0) {
            slime.vivo = false;
            jogador.xp += slime.isBoss ? 200 : 30;

            let xpNecessario = 50 * jogador.nivel;

            if (jogador.xp >= xpNecessario) {
                jogador.nivel++;
                jogador.xp -= xpNecessario;
                jogador.maxVida += 20;
                jogador.vida = Math.min(jogador.maxVida, jogador.vida + 5);

                io.emit('chatNovaMensagem', {
                    autor: 'SISTEMA',
                    texto: `${jogador.nome} subiu para Lv.${jogador.nivel}!`,
                    cor: '#ffff00'
                });
            }

            io.emit('jogadorAtualizado', jogador);

            if (slimes.every(s => !s.vivo)) {
                Object.values(jogadores).forEach(j => {
                    if (!j.morto) {
                        j.vida = Math.min(j.maxVida, j.vida + 10);
                        io.emit('jogadorAtualizado', j);
                    }
                });

                if (faseAtual < 4) {
                    faseAtual++;
                    setTimeout(() => {
                        gerarSlimesFase();
                        io.emit('faseAtualizada', faseAtual);
                    }, 3000);
                } else if (faseAtual === 4) {
                    faseAtual = 5;
                    setTimeout(() => {
                        io.emit('faseAtualizada', faseAtual);
                    }, 3000);
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
            j.x = 400;
            j.y = 300;
        });

        io.emit('jogoReiniciado');
        io.emit('faseAtualizada', faseAtual);
        io.emit('jogadoresAtuais', jogadores);
        io.emit('slimesAtuais', slimes);
    });

    socket.on('disconnect', () => {
        if (jogadores[socket.id]) {
            delete jogadores[socket.id];
            io.emit('jogadorDesconectado', socket.id);
        }
    });
});

// LOOP GLOBAL
setInterval(() => {
    let agora = Date.now();

    slimes.forEach(slime => {
        if (!slime.vivo) return;

        if (!slime.isBoss) {
            slime.x += (Math.random() - 0.5) * 20;
            slime.y += (Math.random() - 0.5) * 20;
        }

        slime.x = Math.max(50, Math.min(750, slime.x));
        slime.y = Math.max(50, Math.min(550, slime.y));
    });

    io.emit('slimesMovimento', slimes);

}, 100);

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});