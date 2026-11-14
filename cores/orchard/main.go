// Orchard's server core, in Go (TinyGo): a farm and county-fair economy (tend apple rows, pear rows and hives;
// press cider and make jam; enter the fair for ribbons and prize money), compiled to WebAssembly with no imports
// and sealed inside an Encroe package.
//
// The Encroe ABI (all u32/i32), the same as every sealed core:
//
//	input_ptr(), output_ptr(), load(len) -> count|-1, player_count(), get_key(idx), get_state(idx) -> len|-1,
//	trade(from, to, item, qty) -> 0 ok | 1 insufficient | 2 bad index | 3 barn full
//
// Orchard's moves return the same codes plus 4 (already acted this tick) and 5 (no such row, recipe or item):
// join() (a 32-byte key in the input buffer), tend(player, row, tick) (writes [item, qty]), make(player, recipe),
// fair(player, entry, tick) (writes [won, coins]), buy(player, item), sell(player, item), restore_tick(player, tick).
//
// Nothing here allocates: the build uses -gc=none, so any allocation fails to link.
package main

import "unsafe"

const (
	maxPlayers = 64
	maxItems   = 16
	inputCap   = 16384
)

const (
	coins   = 1
	water   = 2
	apples  = 3
	pears   = 4
	honey   = 5
	cider   = 6
	jam     = 7
	ribbons = 8

	beehive    = 20
	ciderPress = 21
	jamKitchen = 22
	pearGrove  = 23
)

const (
	ok           = 0
	insufficient = 1
	badIndex     = 2
	full         = 3
	sameTick     = 4
	noSuch       = 5
)

type price struct{ item, coins uint32 }

// What the farm shop sells; it buys produce at its own prices and buildings back at half.
var shop = [...]price{{water, 1}, {beehive, 80}, {ciderPress, 150}, {jamKitchen, 200}, {pearGrove, 400}}
var produce = [...]price{{apples, 2}, {pears, 3}, {honey, 6}, {cider, 25}, {jam, 30}}

// The three rows: what they need, the water they take, and what they give.
type row struct{ needs, water, item, base, spread uint32 }

var rows = [...]row{
	{0, 1, apples, 2, 3},         // 1 apple trees
	{pearGrove, 1, pears, 2, 3},  // 2 pear grove
	{beehive, 0, honey, 1, 2},    // 3 hives
}

// The two recipes: the building, what goes in, and what comes out.
type recipe struct{ building, a, qa, b, qb, out uint32 }

var recipes = [...]recipe{
	{ciderPress, apples, 4, 0, 0, cider}, // 1 cider: four apples
	{jamKitchen, pears, 3, honey, 1, jam}, // 2 jam: three pears and a spoon of honey
}

type player struct {
	pk  [32]byte
	n   uint32
	ids [maxItems]uint32
	qty [maxItems]uint32
}

var (
	input   [inputCap]byte
	output  [1024]byte
	players [maxPlayers]player
	count   uint32
	// The last tick each player tended or went to the fair in: host bookkeeping, not sealed state.
	lastTick [maxPlayers]uint32
)

func rd(at uint32) uint32 {
	return uint32(input[at]) | uint32(input[at+1])<<8 | uint32(input[at+2])<<16 | uint32(input[at+3])<<24
}

func wr(at, v uint32) {
	for i := uint32(0); i < 4; i++ {
		output[at+i] = byte(v >> (8 * i))
	}
}

func (p *player) has(item uint32) uint32 {
	for i := uint32(0); i < p.n; i++ {
		if p.ids[i] == item {
			return p.qty[i]
		}
	}
	return 0
}

// take removes q of item; the caller has checked there is enough. Ids stay ascending.
func (p *player) take(item, q uint32) {
	for i := uint32(0); i < p.n; i++ {
		if p.ids[i] != item {
			continue
		}
		p.qty[i] -= q
		if p.qty[i] == 0 {
			for k := i; k+1 < p.n; k++ {
				p.ids[k], p.qty[k] = p.ids[k+1], p.qty[k+1]
			}
			p.n--
		}
		return
	}
}

// give adds q of item, keeping ids ascending; false when a new kind would not fit.
func (p *player) give(item, q uint32) bool {
	for i := uint32(0); i < p.n; i++ {
		if p.ids[i] == item {
			p.qty[i] += q
			return true
		}
	}
	if p.n == maxItems {
		return false
	}
	at := p.n
	for at > 0 && p.ids[at-1] > item {
		p.ids[at], p.qty[at] = p.ids[at-1], p.qty[at-1]
		at--
	}
	p.ids[at], p.qty[at] = item, q
	p.n++
	return true
}

// kindsAfter is the kinds held after spending `spent` of `item` (a kind spent to zero frees its slot).
func (p *player) kindsAfter(item, spent uint32) uint32 {
	if spent > 0 && p.has(item) == spent {
		return p.n - 1
	}
	return p.n
}

func b2u(b bool) uint32 {
	if b {
		return 1
	}
	return 0
}

// draw is a deterministic draw from the player's key, the tick and a label.
func (p *player) draw(tick, label uint32) uint32 {
	h := uint64(0xcbf29ce484222325) ^ uint64(tick)<<32 ^ uint64(label)
	for _, b := range p.pk {
		h ^= uint64(b)
		h *= 0x100000001b3
	}
	h ^= h >> 31
	h *= 0x94d049bb133111eb
	h ^= h >> 29
	return uint32(h)
}

func priceIn(list []price, item uint32) uint32 {
	for _, e := range list {
		if e.item == item {
			return e.coins
		}
	}
	return 0
}

//export input_ptr
func inputPtr() uint32 { return uint32(uintptr(unsafe.Pointer(&input[0]))) }

//export output_ptr
func outputPtr() uint32 { return uint32(uintptr(unsafe.Pointer(&output[0]))) }

//export player_count
func playerCount() uint32 { return count }

// load replaces the world with a snapshot: count:u32 || (pk[32] || n:u32 || (id:u32, qty:u32)*)*.
//
//export load
func load(length uint32) int32 {
	if length > inputCap || length < 4 {
		return -1
	}
	n := rd(0)
	if n > maxPlayers {
		return -1
	}
	at := uint32(4)
	for c := uint32(0); c < n; c++ {
		if at+36 > length {
			return -1
		}
		p := &players[c]
		copy(p.pk[:], input[at:at+32])
		p.n = rd(at + 32)
		at += 36
		if p.n > maxItems || at+8*p.n > length {
			return -1
		}
		for i := uint32(0); i < p.n; i++ {
			p.ids[i], p.qty[i] = rd(at), rd(at+4)
			at += 8
		}
	}
	count = n
	lastTick = [maxPlayers]uint32{}
	return int32(n)
}

//export get_key
func getKey(idx uint32) int32 {
	if idx >= count {
		return -1
	}
	copy(output[:32], players[idx].pk[:])
	return 32
}

//export get_state
func getState(idx uint32) int32 {
	if idx >= count {
		return -1
	}
	p := &players[idx]
	wr(0, p.n)
	for i := uint32(0); i < p.n; i++ {
		wr(4+8*i, p.ids[i])
		wr(8+8*i, p.qty[i])
	}
	return int32(4 + 8*p.n)
}

// trade is farmer to farmer: coins, produce, buildings; nothing is created or lost.
//
//export trade
func trade(from, to, item, qty uint32) int32 {
	if from >= count || to >= count || from == to || qty == 0 {
		return badIndex
	}
	if players[from].has(item) < qty {
		return insufficient
	}
	held := players[to].has(item)
	if (held == 0 && players[to].n == maxItems) || held > 0xffffffff-qty {
		return full
	}
	players[from].take(item, qty)
	players[to].give(item, qty)
	return ok
}

// join seats a new farmer (key in the input buffer) with 120 coins and six water; a returning key gets its own
// index back; -1 when the county is full.
//
//export join
func join() int32 {
	for c := uint32(0); c < count; c++ {
		if [32]byte(input[:32]) == players[c].pk {
			return int32(c)
		}
	}
	if count == maxPlayers {
		return -1
	}
	p := &players[count]
	copy(p.pk[:], input[:32])
	p.n = 0
	p.give(coins, 120)
	p.give(water, 6)
	lastTick[count] = 0
	count++
	return int32(count - 1)
}

// tend works row 1-3 (apple trees, the pear grove, the hives), using its water. One action per tick. Writes
// [item, qty].
//
//export tend
func tend(idx, r, tick uint32) int32 {
	if idx >= count {
		return badIndex
	}
	if r < 1 || r > uint32(len(rows)) {
		return noSuch
	}
	if tick <= lastTick[idx] {
		return sameTick
	}
	p := &players[idx]
	w := rows[r-1]
	if (w.needs != 0 && p.has(w.needs) == 0) || p.has(water) < w.water {
		return insufficient
	}
	got := w.base + p.draw(tick, r)%w.spread
	if p.kindsAfter(water, w.water)+b2u(p.has(w.item) == 0) > maxItems {
		return full
	}
	if w.water > 0 {
		p.take(water, w.water)
	}
	p.give(w.item, got)
	lastTick[idx] = tick
	wr(0, w.item)
	wr(4, got)
	return ok
}

// make runs recipe 1 (cider) or 2 (jam) in its building.
//
//export make
func make_(idx, r uint32) int32 {
	if idx >= count {
		return badIndex
	}
	if r < 1 || r > uint32(len(recipes)) {
		return noSuch
	}
	p := &players[idx]
	c := recipes[r-1]
	if p.has(c.building) == 0 || p.has(c.a) < c.qa || (c.qb > 0 && p.has(c.b) < c.qb) {
		return insufficient
	}
	freed := b2u(p.has(c.a) == c.qa)
	if c.qb > 0 {
		freed += b2u(p.has(c.b) == c.qb)
	}
	if p.n-freed+b2u(p.has(c.out) == 0) > maxItems {
		return full
	}
	p.take(c.a, c.qa)
	if c.qb > 0 {
		p.take(c.b, c.qb)
	}
	p.give(c.out, 1)
	return ok
}

// fair enters one cider (1) or one jam (2) at the county fair: two entries in five win a ribbon and prize money.
// One action per tick. Writes [won, coins].
//
//export fair
func fair(idx, entry, tick uint32) int32 {
	if idx >= count {
		return badIndex
	}
	if entry < 1 || entry > 2 {
		return noSuch
	}
	if tick <= lastTick[idx] {
		return sameTick
	}
	p := &players[idx]
	item, prize := uint32(cider), uint32(60)
	if entry == 2 {
		item, prize = jam, 80
	}
	if p.has(item) == 0 {
		return insufficient
	}
	won := p.draw(tick, 200+entry)%5 < 2
	if won && p.kindsAfter(item, 1)+b2u(p.has(ribbons) == 0)+b2u(p.has(coins) == 0) > maxItems {
		return full
	}
	p.take(item, 1)
	if won {
		p.give(ribbons, 1)
		p.give(coins, prize)
	}
	lastTick[idx] = tick
	wr(0, b2u(won))
	wr(4, prize*b2u(won))
	return ok
}

//export buy
func buy(idx, item uint32) int32 {
	if idx >= count {
		return badIndex
	}
	cost := priceIn(shop[:], item)
	if cost == 0 {
		return noSuch
	}
	p := &players[idx]
	if p.has(coins) < cost {
		return insufficient
	}
	if p.has(item) == 0 && p.kindsAfter(coins, cost) == maxItems {
		return full
	}
	p.take(coins, cost)
	p.give(item, 1)
	return ok
}

// sell sells one unit of produce at the shop's price, or a building back at half; water is not bought back.
//
//export sell
func sell(idx, item uint32) int32 {
	if idx >= count {
		return badIndex
	}
	value := priceIn(produce[:], item)
	if value == 0 && item >= beehive {
		value = priceIn(shop[:], item) / 2
	}
	if value == 0 {
		return noSuch
	}
	p := &players[idx]
	if p.has(item) == 0 {
		return insufficient
	}
	if p.has(coins) == 0 && p.kindsAfter(item, 1) == maxItems {
		return full
	}
	p.take(item, 1)
	p.give(coins, value)
	return ok
}

//export restore_tick
func restoreTick(idx, tick uint32) int32 {
	if idx >= count {
		return badIndex
	}
	lastTick[idx] = tick
	return ok
}

func main() {}
