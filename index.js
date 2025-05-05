const djs = require('discord.js');
const fs = require('fs');
const client = new djs.Client({
	intents: ['Guilds', 'GuildMessages','MessageContent'].map(r => djs.IntentsBitField.Flags[r]),
});
// 'GuildMembers'
const settings = require('./settings.json');

class Country {
    constructor(country, industry, money, technologyLevel, units, type, flag, hp = 100) {
        this.country = country;
        this.pid = '';
        this.industry = industry;
        this.money = money;
        this.technologyLevel = technologyLevel; // Represents technological advancement (0–100%)
        this.units = units; // Object with unit counts: { Infantry: X, Cavalry: Y, Artillery: Z }
        this.type = type;
        this.flag = flag || '🏳️';
        this.hp = hp; // Health points of the nation
        this.active = true;
    }

    // Calculate the war score for a country based on its units and technology level
    getWarScore() {
        const unitStats = {
            Infantry: { attack: 1, defense: 1 },
            Cavalry: { attack: 5, defense: 10 },
            Artillery: { attack: 10, defense: 5 },
        };

        let totalAttack = 0;
        let totalDefense = 0;

        for (const [unitType, count] of Object.entries(this.units)) {
            totalAttack += unitStats[unitType].attack * count;
            totalDefense += unitStats[unitType].defense * count;
        }

        // Amplify by technology level
        totalAttack += totalAttack * (this.technologyLevel / 100);
        totalDefense += totalDefense * (this.technologyLevel / 100);

        return { attack: totalAttack, defense: totalDefense };
    }

    /**
     * Simulates a single battle between two countries and determines the outcome.
     * @param {Country} attacker - The attacking country.
     * @param {Country} defender - The defending country.
     * @returns {Object} - The result of the battle, including winner, loser, casualties, and r_diff.
     */
    static getBattleResult(attacker, defender) {
        // Ensure both nations have units to fight
        if (!attacker.hasUnits() || !defender.hasUnits()) {
            throw new Error("One or both nations do not have any units left to fight.");
        }

        const attackerStats = attacker.getWarScore();
        const defenderStats = defender.getWarScore();

        // Calculate r_diff
        const atk_x = attackerStats.attack;
        const def_x = attackerStats.defense;
        const atk_y = defenderStats.attack;
        const def_y = defenderStats.defense;
        const r_diff = (atk_x - def_y) - (atk_y - def_x);

        // Random factors to add unpredictability
        const attackerRandomFactor = Math.random() * 0.2 + 0.9; // Random factor between 0.9 and 1.1
        const defenderRandomFactor = Math.random() * 0.2 + 0.9; // Random factor between 0.9 and 1.1

        const adjustedAtkPower = atk_x * attackerRandomFactor - def_y;
        const adjustedDefPower = atk_y * defenderRandomFactor - def_x;

        const totalPower = Math.max(1, adjustedAtkPower + adjustedDefPower); // Ensure no division by zero
        const winProbability = Math.max(0.2, Math.min(0.8, adjustedAtkPower / totalPower)); // Cap probability between 20% and 80%

        // Randomized outcome
        const rng = Math.random();
        const winner = rng < winProbability ? attacker : defender;
        const loser = winner === attacker ? defender : attacker;

        // Calculate casualties for both sides based on r_diff
        const atkLoses = attacker.applyCasualties(r_diff, winner === defender);
        const defLoses = defender.applyCasualties(r_diff, winner === attacker);

        // Adjust HP
        if (winner === attacker) {
            defender.hp = Math.max(0, defender.hp - 10);
        } else {
            attacker.hp = Math.max(0, attacker.hp - 10);
        }

        return {
            winner,
            loser,
            atkLoses,
            defLoses,
            r_diff,
        };
    }

    /**
     * Applies casualties to a country based on r_diff.
     * @param {number} r_diff - The power difference between the attacker and defender.
     * @param {boolean} isLosingSide - Whether the country is the losing side.
     * @returns {Object} - The casualties sustained for each unit type.
     */
    applyCasualties(r_diff, isLosingSide) {
        const casualties = {};

        // Reduce the impact of r_diff using a logarithmic scale
        const scaledRDiff = Math.log(1 + Math.abs(r_diff)) * (isLosingSide ? 0.02 : 0.01);

        // Base casualty rates (further reduced)
        const baseCasualtyRate = isLosingSide ? 0.01 : 0.005; // Losing side loses slightly more
        const casualtyRate = baseCasualtyRate + scaledRDiff;

        // Loop through each unit type and calculate casualties
        for (const unitType in this.units) {
            const maxLosses = this.units[unitType];

            // Calculate casualties for this unit type
            let unitCasualties = Math.floor(casualtyRate * maxLosses);

            // Cap the maximum losses to avoid full annihilation in one battle
            const maxAllowedLosses = Math.ceil(maxLosses * 0.2); // Max 20% of units lost in one battle
            unitCasualties = Math.min(unitCasualties, maxAllowedLosses);

            // Ensure at least 1 casualty if units remain
            if (unitCasualties < 1 && maxLosses > 0) {
                unitCasualties = 1;
            }

            // Apply casualties and track losses
            casualties[unitType] = unitCasualties;
            this.units[unitType] -= unitCasualties;
        }

        return casualties;
    }

    /**
     * Checks if the nation has any units left to fight.
     * @returns {boolean} - True if the nation has units, false otherwise.
     */
    hasUnits() {
        return Object.values(this.units).some((count) => count > 0);
    }

    /**
     * Simulates a full war between two countries, where they attack each other until one reaches 0 HP.
     * @param {Country} nation1 - The first country involved in the war.
     * @param {Country} nation2 - The second country involved in the war.
     * @returns {Object} - The result of the war, including the winner, loser, and battle history.
     */
    static simulateWar(nation1, nation2) {
        const battleHistory = [];
        let round = 1;

        while (nation1.hp > 0 && nation2.hp > 0 && nation1.hasUnits() && nation2.hasUnits()) {
            console.log(`--- Battle ${round} ---`);
            const battleResult = this.getBattleResult(nation1, nation2);
            battleHistory.push({
                round,
                winner: battleResult.winner.country,
                loser: battleResult.loser.country,
                r_diff: battleResult.r_diff,
                nation1Hp: nation1.hp,
                nation2Hp: nation2.hp,
                atkLoses: battleResult.atkLoses,
                defLoses: battleResult.defLoses,
            });

            round++;
        }

        const winner = nation1.hp > 0 && nation1.hasUnits() ? nation1 : nation2;
        const loser = nation1.hp > 0 && nation1.hasUnits() ? nation2 : nation1;

        return {
            winner: winner.country,
            loser: loser.country,
            remainingHp: winner.hp,
            battleHistory,
        };
    }
}

// Example Usage
const nation1 = new Country('Nation A', 100, 1000, 80, { Infantry: 500, Cavalry: 200, Artillery: 50 }, 'industrial', '🏴');
const nation2 = new Country('Nation B', 120, 1500, 90, { Infantry: 400, Cavalry: 150, Artillery: 70 }, 'agricultural', '🏳️');

// Simulate a full war
const warResult = Country.simulateWar(nation1, nation2);

console.log('War Result:', warResult);
console.log('Battle History:', warResult.battleHistory);

class Game {
		constructor() {
				this.countries = require('./countries/countries-1933.js').countries.map(c => new Country(...c));
				this.started = false;
		}

		start(countriesFile) {
				this.countries = require(`./countries/${countriesFile}`).countries.map(c => new Country(...c));
				this.started = true;
		}

		end() {
				this.started = false;
				this.countries = require('./countries/countries-1933.js').countries.map(c => new Country(...c));
		}

	assignCountry(pid, country) {
		const c = this.countries.find(c => c.country === country);
		if (c) {
			c.pid = pid;
			c.active = true;
			return c;
		}
	}

	getCountry(country) {
		if (!isNaN(country)) return this.countries[country - 1];
		return this.countries.find(c => c.country.toLowerCase() === country.toLowerCase());
	}

	abandonCountry(pid) {
		const c = this.countries.find(c => c.pid === pid && c.active);
		if (c) {
			c.pid = '';
			return c;
		}
	}

	getPlayer(id) {
		return this.countries.find(c => c.pid === id && c.active);
	}
}

const games = {};

//Money Interval Manager
setInterval(async () => {
		for (const guild of Object.keys(games)) {
				const game = games[guild];
				if (game.started) {
						game.countries.forEach(c => {
								if (/*c.pid &&*/ c.active) {
										c.money += ((c.industry / 20) - (c.tank * client.tankUpkeep[guild] + c.army * client.armyUpkeep[guild]));
										//console.log(`${c.country} has gained $${c.industry / 20} and lost $$(c.tank * client.tankUpkeep[guild] + c.army * client.armyUpkeep[guild]) resulting in a total of ((c.industry / 20) - (c.tank * client.tankUpkeep[guild] + c.army * client.armyUpkeep[guild]))`);
								}
						});
				} else {
						console.log('Game not started in this server!');
				}
		}
		client.interval = Date.now();
}, 1000 * 60 * 60 * settings.moneyIntervalInHours);

//SaveGame Manager
setInterval(async () => {
	for (const guild of Object.keys(games)) {
		const game = games[guild];
		if (game.started) {
			const saveObj = { others: {}, game: [] };
			saveObj.game = game.countries;
			saveObj.others = { started: client.gameStart[guild], yearStart: client.yearStart[guild], tankCost: client.tankCost[guild], tankUpkeep: client.tankUpkeep[guild], armyUpkeep: client.armyUpkeep[guild], minutesPerMonth: client.minutesPerMonth[guild] };
			//!! Please create the folder saves or this will error
			fs.writeFileSync(`./saves/${guild}.json`, JSON.stringify(saveObj));
			console.log(`Saved game in ${guild}`);
		}
	}
}, 1000 * 60 * settings.saveGameInMinutes);

//Commands handler
const files = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
const commands = {};
files.forEach(file => {
	commands[file.slice(0, -3)] = require(`./commands/${file}`);
});

client.once('ready', async () => {
	console.log(`Logged in as ${client.user.tag}!`);
	await require('./deploy-commands.js')(client);
	client.interval = Date.now();
	client.gameStart = {};
	client.yearStart = {};
	client.tankCost = {};
	client.tankUpkeep = {};
	client.armyUpkeep = {};
	client.minutesPerMonth = {};
});

client.on('interactionCreate', async interaction => {
	if (!interaction.member) return;
	try {
		if (!games[interaction.guild.id]) games[interaction.guild.id] = new Game();
		const game = games[interaction.guild.id];
		if (interaction.isCommand()) {
			const command = commands[interaction.commandName];
			if (command?.interaction) {
				await command.interaction(interaction, game, Country);
			}
		} else if (interaction.isButton()) {
			const command = commands[interaction.customId.split('-')[0]];
			if (command?.button) {
				await command.button(interaction);
			}
		}
	} catch (err) {
		const err_payload = { content: `There was an error while executing this command!\n${err}`, ephemeral: true };
		console.log(err);
		if (interaction.replied || interaction.deferred) interaction.followUp(err_payload);
		else await interaction.reply(err_payload);
	}
});

client.on('messageCreate', async msg => {
	if (!msg.member) return;
	if (msg.author.bot) return;
	try {
	} catch (err) {
		console.log(err);
		await msg.reply({ content: `There was an error while executing this command!\n${err}` });
	}
});

client.login(settings.token);
