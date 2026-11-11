import AppKit
import AVFoundation
import ServiceManagement

// MARK: - Data

struct Word {
    let hanzi: String
    let pinyin: String
    let meaning: String
}

enum Store {
    static let supportDir: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("MacHanzi", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()
    static let localList = supportDir.appendingPathComponent("words.txt")
    static let cloudList = URL(fileURLWithPath: NSHomeDirectory()
        + "/Library/Mobile Documents/iCloud~dk~simonbs~Scriptable/Documents/words.txt")
    static let localRadicals = supportDir.appendingPathComponent("radicals.txt")
    static let cloudRadicals = URL(fileURLWithPath: NSHomeDirectory()
        + "/Library/Mobile Documents/iCloud~dk~simonbs~Scriptable/Documents/radicals.txt")
}

// Same format as the iPhone script: hanzi | pinyin | meaning, "#" = comment
func parseWords(_ text: String) -> [Word] {
    var out: [Word] = []
    for raw in text.components(separatedBy: .newlines) {
        let line = raw.trimmingCharacters(in: .whitespaces)
        if line.isEmpty || line.hasPrefix("#") { continue }
        let parts = line
            .replacingOccurrences(of: "\t", with: "|")
            .components(separatedBy: "|")
            .map { $0.trimmingCharacters(in: .whitespaces) }
        guard let hanzi = parts.first, !hanzi.isEmpty else { continue }
        let pinyin = parts.count > 1 ? parts[1] : ""
        let meaning = parts.count > 2 ? parts[2...].joined(separator: " / ") : ""
        out.append(Word(hanzi: hanzi, pinyin: pinyin, meaning: meaning))
    }
    return out
}

// Copy the iCloud list into our own folder when we are allowed to read it.
@discardableResult
func refreshLocalCopy(from cloud: URL = Store.cloudList, to local: URL = Store.localList) -> Bool {
    guard let data = try? Data(contentsOf: cloud), !data.isEmpty else { return false }
    if (try? Data(contentsOf: local)) != data {
        try? data.write(to: local)
    }
    return true
}

// MARK: - Radicals (same file and same picking rule as the iPhone script Radicals.js)

struct Example { let char: String; let pinyin: String; let meaning: String }
struct Radical { let radical: String; let pinyin: String; let name: String; let meaning: String; let examples: [Example] }

// radical | pinyin | Han-Viet name | meaning | examples ("河 hé sông; 海 hǎi biển; ...")
func parseRadicals(_ text: String) -> [Radical] {
    var out: [Radical] = []
    for raw in text.components(separatedBy: .newlines) {
        let line = raw.trimmingCharacters(in: .whitespaces)
        if line.isEmpty || line.hasPrefix("#") { continue }
        let p = line.replacingOccurrences(of: "\t", with: "|")
            .components(separatedBy: "|")
            .map { $0.trimmingCharacters(in: .whitespaces) }
        guard !p[0].isEmpty else { continue }
        let examples = (p.count > 4 ? p[4] : "").components(separatedBy: ";").compactMap { s -> Example? in
            let t = s.split(whereSeparator: { $0.isWhitespace }).map(String.init)
            guard let c = t.first else { return nil }
            return Example(char: c, pinyin: t.count > 1 ? t[1] : "", meaning: t.dropFirst(2).joined(separator: " "))
        }
        out.append(Radical(radical: p[0], pinyin: p.count > 1 ? p[1] : "", name: p.count > 2 ? p[2] : "",
                           meaning: p.count > 3 ? p[3] : "", examples: Array(examples.prefix(3))))
    }
    return out
}

func loadRadicals() -> [Radical] {
    guard let text = try? String(contentsOf: Store.localRadicals, encoding: .utf8) else { return [] }
    return parseRadicals(text)
}

// Exact copy of the random generator in Radicals.js (mulberry32), so Mac and iPhone agree.
struct Mulberry32 {
    var a: UInt32
    init(seed: Int) { a = UInt32(truncatingIfNeeded: seed) }
    mutating func next() -> Double {
        a = a &+ 0x6D2B79F5
        var t = (a ^ (a >> 15)) &* (1 | a)
        t = (t &+ ((t ^ (t >> 7)) &* (61 | t))) ^ t
        return Double(t ^ (t >> 14)) / 4294967296.0
    }
}

let radicalMinutes = 10   // keep the same as MINUTES in Radicals.js

func radicalSlot(_ date: Date = Date()) -> Int {
    Int((date.timeIntervalSince1970 * 1000).rounded(.down)) / (radicalMinutes * 60_000)
}

// Index of the radical to show in this time slot: each cycle is a fresh shuffle of the list.
func radicalIndex(count n: Int, slot: Int) -> Int {
    var order = Array(0..<n)
    var r = Mulberry32(seed: (slot / n) * 7919 + n)
    var i = n - 1
    while i > 0 {
        let j = Int(r.next() * Double(i + 1))
        order.swapAt(i, j)
        i -= 1
    }
    return order[slot % n]
}

func loadWords() -> [Word] {
    guard let text = try? String(contentsOf: Store.localList, encoding: .utf8) else { return [] }
    return parseWords(text)
}

// MARK: - Engine (which word to show)

final class Engine {
    let defaults: UserDefaults
    var words: [Word] = []
    var deck: [Int] = []
    var history: [Int] = []   // last = current word
    var forward: [Int] = []   // words we stepped back from
    var changedAt = Date()

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    var intervalMin: Int {
        get { let v = defaults.integer(forKey: "interval"); return v == 0 ? 10 : v }
        set { defaults.set(newValue, forKey: "interval") }
    }

    var current: Word? {
        guard let i = history.last, i < words.count else { return nil }
        return words[i]
    }

    func signature() -> String {
        guard let f = words.first, let l = words.last else { return "" }
        return "\(words.count):\(f.hanzi):\(l.hanzi)"
    }

    func load() {
        words = loadWords()
        if defaults.string(forKey: "signature") != signature() {
            deck = []; history = []; forward = []
            defaults.set(signature(), forKey: "signature")
        } else {
            deck = (defaults.array(forKey: "deck") as? [Int] ?? []).filter { $0 < words.count }
            history = (defaults.array(forKey: "history") as? [Int] ?? []).filter { $0 < words.count }
            changedAt = Date(timeIntervalSince1970: defaults.double(forKey: "changedAt"))
        }
        if history.isEmpty && !words.isEmpty { advance() }
    }

    func save() {
        defaults.set(deck, forKey: "deck")
        defaults.set(history, forKey: "history")
        defaults.set(changedAt.timeIntervalSince1970, forKey: "changedAt")
    }

    func advance() {
        guard !words.isEmpty else { return }
        if let f = forward.popLast() {
            history.append(f)
        } else {
            if deck.isEmpty {
                deck = Array(0..<words.count).shuffled()
                // do not show the same word twice in a row across decks
                if words.count > 1, let cur = history.last, deck.last == cur { deck.swapAt(deck.count - 1, 0) }
            }
            history.append(deck.removeLast())
        }
        if history.count > 50 { history.removeFirst(history.count - 50) }
        changedAt = Date()
        save()
    }

    func back() {
        guard history.count > 1 else { return }
        forward.append(history.removeLast())
        changedAt = Date()
        save()
    }

    // true if a new word was picked because the interval has passed
    @discardableResult
    func tick() -> Bool {
        if Date().timeIntervalSince(changedAt) >= Double(intervalMin * 60) {
            advance()
            return true
        }
        return false
    }
}

// MARK: - Card views (menu panel and desktop card)

func makeLabel(_ text: String, size: CGFloat, weight: NSFont.Weight, color: NSColor, maxWidth: CGFloat,
               align: NSTextAlignment = .center) -> NSTextField {
    let f = NSTextField(wrappingLabelWithString: text)
    f.font = NSFont.systemFont(ofSize: size, weight: weight)
    f.textColor = color
    f.alignment = align
    f.preferredMaxLayoutWidth = maxWidth
    f.isSelectable = false
    return f
}

struct CardColors {
    let hanzi: NSColor, pinyin: NSColor, meaning: NSColor
    static let system = CardColors(hanzi: .labelColor, pinyin: .labelColor, meaning: .secondaryLabelColor)
}

func rgb(_ hex: UInt32) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
}

// Palette A, "paper and ink": warm cream card, dark brown hanzi, vermilion pinyin
enum PaperInk {
    static let background = rgb(0xF5EFE3)
    static let colors = CardColors(hanzi: rgb(0x2B2118), pinyin: rgb(0xA8392B), meaning: rgb(0x6B5E50))
}

func makeCard(_ w: Word, width: CGFloat, inset: CGFloat = 16, vInset: CGFloat = 10,
              colors: CardColors = .system) -> NSView {
    let n = w.hanzi.count
    let size: CGFloat = n <= 2 ? 52 : (n <= 4 ? 40 : 26)
    let inner = width - inset * 2
    var views: [NSView] = [makeLabel(w.hanzi, size: size, weight: .medium, color: colors.hanzi, maxWidth: inner)]
    if !w.pinyin.isEmpty { views.append(makeLabel(w.pinyin, size: 20, weight: .semibold, color: colors.pinyin, maxWidth: inner)) }
    if !w.meaning.isEmpty { views.append(makeLabel(w.meaning, size: 13, weight: .regular, color: colors.meaning, maxWidth: inner)) }

    let stack = NSStackView(views: views)
    stack.orientation = .vertical
    stack.alignment = .centerX
    stack.spacing = 4
    stack.translatesAutoresizingMaskIntoConstraints = false

    let container = NSView()
    container.addSubview(stack)
    NSLayoutConstraint.activate([
        container.widthAnchor.constraint(equalToConstant: width),
        stack.topAnchor.constraint(equalTo: container.topAnchor, constant: vInset),
        stack.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -vInset),
        stack.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: inset),
        stack.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -inset),
    ])
    container.layoutSubtreeIfNeeded()
    container.frame = NSRect(x: 0, y: 0, width: width, height: container.fittingSize.height)
    return container
}

// Put a stack inside a fixed-width container and size it to fit.
func wrapCard(_ content: NSView, width: CGFloat, inset: CGFloat, vInset: CGFloat) -> NSView {
    content.translatesAutoresizingMaskIntoConstraints = false
    let container = NSView()
    container.addSubview(content)
    NSLayoutConstraint.activate([
        container.widthAnchor.constraint(equalToConstant: width),
        content.topAnchor.constraint(equalTo: container.topAnchor, constant: vInset),
        content.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -vInset),
        content.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: inset),
        content.trailingAnchor.constraint(lessThanOrEqualTo: container.trailingAnchor, constant: -inset),
    ])
    container.layoutSubtreeIfNeeded()
    container.frame = NSRect(x: 0, y: 0, width: width, height: container.fittingSize.height)
    return container
}

// Radical card: radical, name, pinyin, meaning on the left; 3 examples on the right.
func makeRadicalCard(_ r: Radical) -> NSView {
    let c = PaperInk.colors
    let left = NSStackView(views: [
        makeLabel(r.radical, size: 56, weight: .bold, color: c.hanzi, maxWidth: 116, align: .left),
        makeLabel(r.name, size: 15, weight: .bold, color: c.hanzi, maxWidth: 116, align: .left),
        makeLabel(r.pinyin, size: 14, weight: .semibold, color: c.pinyin, maxWidth: 116, align: .left),
        makeLabel(r.meaning, size: 13, weight: .regular, color: c.meaning, maxWidth: 116, align: .left),
    ])
    left.orientation = .vertical
    left.alignment = .leading
    left.spacing = 2
    left.widthAnchor.constraint(equalToConstant: 116).isActive = true

    let rows: [NSView] = r.examples.map { e in
        let ch = makeLabel(e.char, size: 28, weight: .medium, color: c.hanzi, maxWidth: 44, align: .left)
        let info = NSStackView(views: [
            makeLabel(e.pinyin, size: 14, weight: .semibold, color: c.pinyin, maxWidth: 150, align: .left),
            makeLabel(e.meaning, size: 14, weight: .regular, color: c.meaning, maxWidth: 150, align: .left),
        ])
        info.orientation = .vertical
        info.alignment = .leading
        info.spacing = 0
        let row = NSStackView(views: [ch, info])
        row.orientation = .horizontal
        row.alignment = .centerY
        row.spacing = 8
        return row
    }
    let right = NSStackView(views: rows)
    right.orientation = .vertical
    right.alignment = .leading
    right.spacing = 6

    let main = NSStackView(views: [left, right])
    main.orientation = .horizontal
    main.alignment = .centerY
    main.spacing = 16
    return wrapCard(main, width: 380, inset: 20, vInset: 16)
}

// A small rounded card that sits on the desktop, under all app windows (like a widget).
final class DesktopCard: NSObject, NSWindowDelegate {
    let panel: NSPanel
    let fx = NSView()
    let key: String        // prefix for the saved position, e.g. "desk" -> deskX, deskY
    var topLeft: NSPoint   // y is the top edge, so the card grows downward

    init(key: String, width: CGFloat, drop: CGFloat) {
        self.key = key
        let d = UserDefaults.standard
        var tl: NSPoint?
        if let x = d.object(forKey: key + "X") as? Double, let y = d.object(forKey: key + "Y") as? Double {
            if NSScreen.screens.contains(where: { $0.frame.contains(NSPoint(x: x, y: y - 1)) }) { tl = NSPoint(x: x, y: y) }
        }
        if tl == nil, let s = NSScreen.main {
            tl = NSPoint(x: s.visibleFrame.maxX - width - 24, y: s.visibleFrame.maxY - 24 - drop)
        }
        topLeft = tl ?? NSPoint(x: 100, y: 400)
        panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: width, height: 140),
                        styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        super.init()
        panel.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopIconWindow)) + 1)
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.hidesOnDeactivate = false
        panel.isMovableByWindowBackground = true
        panel.delegate = self
        fx.wantsLayer = true
        fx.layer?.backgroundColor = PaperInk.background.cgColor
        fx.layer?.cornerRadius = 22
        fx.layer?.masksToBounds = true
        panel.contentView = fx
    }

    func show(_ content: NSView) {
        fx.subviews.forEach { $0.removeFromSuperview() }
        content.frame.origin = .zero
        fx.addSubview(content)
        let size = content.frame.size
        panel.setFrame(NSRect(x: topLeft.x, y: topLeft.y - size.height, width: size.width, height: size.height), display: true)
        panel.orderFrontRegardless()
        panel.invalidateShadow()
    }

    func hide() { panel.orderOut(nil) }

    func windowDidMove(_ notification: Notification) {
        topLeft = NSPoint(x: panel.frame.minX, y: panel.frame.maxY)
        UserDefaults.standard.set(Double(topLeft.x), forKey: key + "X")
        UserDefaults.standard.set(Double(topLeft.y), forKey: key + "Y")
    }
}

// MARK: - App

final class AppController: NSObject, NSApplicationDelegate, NSMenuDelegate {
    let engine = Engine()
    let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    let menu = NSMenu()
    let synth = AVSpeechSynthesizer()
    let desk = DesktopCard(key: "desk", width: 240, drop: 0)
    let radCard = DesktopCard(key: "rad", width: 380, drop: 175)
    var radicals: [Radical] = []
    var radicalShownSlot = -1
    var timer: Timer?

    var radOn: Bool {
        get { UserDefaults.standard.object(forKey: "radOn") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "radOn") }
    }

    func updateRadical() {
        let slot = radicalSlot()
        radicalShownSlot = slot
        if radOn, !radicals.isEmpty {
            radCard.show(makeRadicalCard(radicals[radicalIndex(count: radicals.count, slot: slot)]))
        } else {
            radCard.hide()
        }
    }

    var deskOn: Bool {
        get { UserDefaults.standard.object(forKey: "deskOn") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "deskOn") }
    }

    func updateDesk() {
        if deskOn, let w = engine.current {
            desk.show(makeCard(w, width: 240, inset: 20, vInset: 18, colors: PaperInk.colors))
        } else {
            desk.hide()
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        engine.load()          // local copy first, so a word shows right away
        menu.delegate = self
        statusItem.menu = menu
        statusItem.button?.font = NSFont.systemFont(ofSize: 14)
        render()
        radicals = loadRadicals()
        updateRadical()
        syncFromCloud()        // iCloud read may block (permission prompt), so never on the main thread

        // Open at login by default. Only done once, so turning it off in the menu sticks.
        if !UserDefaults.standard.bool(forKey: "loginSetupDone") {
            do {
                try SMAppService.mainApp.register()
                UserDefaults.standard.set(true, forKey: "loginSetupDone")
            } catch {
                NSLog("MacHanzi: could not enable open at login: \(error)")
            }
        }

        timer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in self?.tick() }
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification, object: nil, queue: .main
        ) { [weak self] _ in self?.tick() }
    }

    var lastSync = Date()

    func tick() {
        if engine.tick() { render() }
        if radicalSlot() != radicalShownSlot { updateRadical() }
        if Date().timeIntervalSince(lastSync) >= 3600 {   // pick up edits to words.txt once an hour
            lastSync = Date()
            syncFromCloud()
        }
    }

    // Refresh the local copy from iCloud in the background, then reload if the list changed.
    func syncFromCloud() {
        DispatchQueue.global(qos: .utility).async { [weak self] in
            let before = try? Data(contentsOf: Store.localList)
            refreshLocalCopy()
            let after = try? Data(contentsOf: Store.localList)
            let radBefore = try? Data(contentsOf: Store.localRadicals)
            refreshLocalCopy(from: Store.cloudRadicals, to: Store.localRadicals)
            let radAfter = try? Data(contentsOf: Store.localRadicals)
            DispatchQueue.main.async {
                if before != after {
                    self?.engine.load()
                    self?.render()
                }
                if radBefore != radAfter {
                    self?.radicals = loadRadicals()
                    self?.updateRadical()
                }
            }
        }
    }

    func render() {
        defer { updateDesk() }
        guard let w = engine.current else {
            statusItem.button?.title = "汉"
            return
        }
        let short = !w.pinyin.isEmpty && (w.hanzi.count + w.pinyin.count) <= 16
        statusItem.button?.title = short ? "\(w.hanzi) \(w.pinyin)" : w.hanzi
    }

    // MARK: menu

    func menuNeedsUpdate(_ menu: NSMenu) { rebuildMenu() }

    @discardableResult
    func add(_ title: String, _ sel: Selector, key: String = "") -> NSMenuItem {
        let item = NSMenuItem(title: title, action: sel, keyEquivalent: key)
        item.target = self
        menu.addItem(item)
        return item
    }

    func rebuildMenu() {
        menu.removeAllItems()
        if let w = engine.current {
            let card = NSMenuItem()
            card.view = cardView(w)
            menu.addItem(card)
            menu.addItem(.separator())
            add("Phát âm", #selector(speak), key: "s")
        } else {
            let empty = NSMenuItem(title: "Không có từ nào. Kiểm tra words.txt", action: nil, keyEquivalent: "")
            empty.isEnabled = false
            menu.addItem(empty)
        }
        add("Từ tiếp", #selector(nextWord), key: "n")
        menu.addItem(.separator())

        let sub = NSMenu()
        for m in [1, 5, 10, 30, 60] {
            let it = NSMenuItem(title: "\(m) phút", action: #selector(setInterval(_:)), keyEquivalent: "")
            it.target = self
            it.tag = m
            it.state = engine.intervalMin == m ? .on : .off
            sub.addItem(it)
        }
        let parent = NSMenuItem(title: "Đổi từ mỗi", action: nil, keyEquivalent: "")
        parent.submenu = sub
        menu.addItem(parent)

        let deskItem = add("Hiện ô từ vựng", #selector(toggleDesk))
        deskItem.state = deskOn ? .on : .off
        let radItem = add("Hiện ô bộ thủ", #selector(toggleRad))
        radItem.state = radOn ? .on : .off
        let login = add("Mở khi đăng nhập", #selector(toggleLogin))
        login.state = SMAppService.mainApp.status == .enabled ? .on : .off
        menu.addItem(.separator())
        add("Thoát", #selector(quit), key: "q")
    }

    func cardView(_ w: Word) -> NSView { makeCard(w, width: 280) }

    // MARK: actions

    @objc func speak() {
        guard let w = engine.current else { return }
        synth.stopSpeaking(at: .immediate)
        let u = AVSpeechUtterance(string: w.hanzi)
        u.voice = AVSpeechSynthesisVoice(language: "zh-CN")
        u.rate = 0.4
        synth.speak(u)
    }

    @objc func nextWord() { engine.advance(); render() }

    @objc func setInterval(_ sender: NSMenuItem) {
        engine.intervalMin = sender.tag
        engine.changedAt = Date()
        engine.save()
    }

    @objc func toggleRad() {
        radOn.toggle()
        updateRadical()
    }

    @objc func toggleDesk() {
        deskOn.toggle()
        updateDesk()
    }

    @objc func toggleLogin() {
        let s = SMAppService.mainApp
        do {
            if s.status == .enabled { try s.unregister() } else { try s.register() }
        } catch {
            NSLog("MacHanzi: login item change failed: \(error)")
        }
    }

    @objc func quit() { NSApp.terminate(nil) }
}

// MARK: - Self test (run: MacHanzi --selftest)

func runSelfTest() -> Never {
    var failed = 0
    func check(_ name: String, _ ok: Bool) {
        print((ok ? "PASS " : "FAIL ") + name)
        if !ok { failed += 1 }
    }

    let sample = parseWords("""
    # comment
    白 | bái | trắng

    对不起 | duì bu qǐ | xin lỗi | thêm
    祝你生日快乐 | zhù nǐ shēngri kuàilè | Chúc bạn sinh nhật vui vẻ
    """)
    check("parse: 3 words, comment and blank skipped", sample.count == 3)
    check("parse: pinyin and meaning", sample[0].pinyin == "bái" && sample[0].meaning == "trắng")
    check("parse: extra columns joined", sample[1].meaning == "xin lỗi / thêm")

    let suite = "machanzi.selftest"
    UserDefaults.standard.removePersistentDomain(forName: suite)
    let e = Engine(defaults: UserDefaults(suiteName: suite)!)
    e.load()
    check("list loaded (more than 900 words)", e.words.count > 900)

    var seen = Set<Int>()
    seen.insert(e.history.last!)
    for _ in 1..<e.words.count { e.advance(); seen.insert(e.history.last!) }
    check("every word once before repeat", seen.count == e.words.count)

    e.advance()
    let cur = e.history.last!
    e.back()
    let prev = e.history.last!
    e.advance()
    check("back then next returns to same word", e.history.last! == cur && prev != cur)

    e.intervalMin = 1
    e.changedAt = Date().addingTimeInterval(-61)
    check("tick advances after interval", e.tick())
    check("tick waits before interval", !e.tick())

    let rs = parseRadicals("""
    # c
    氵 | shuǐ | Thủy | nước | 河 hé sông; 海 hǎi biển; 洗 xǐ rửa, giặt
    口 | kǒu | Khẩu | miệng
    """)
    check("radicals: parse 2, comment skipped", rs.count == 2)
    check("radicals: 3 examples, meaning with spaces kept", rs[0].examples.count == 3 && rs[0].examples[2].meaning == "rửa, giặt")
    check("radicals: no examples is fine", rs[1].examples.isEmpty)
    let real = loadRadicals()
    check("radicals: local list has 50", real.count == 50)
    let base = (radicalSlot() / 50) * 50
    check("radicals: one cycle shows all 50", Set((0..<50).map { radicalIndex(count: 50, slot: base + $0) }).count == 50)

    UserDefaults.standard.removePersistentDomain(forName: suite)
    print("iCloud list readable from this process: \(FileManager.default.isReadableFile(atPath: Store.cloudList.path))")
    exit(failed == 0 ? 0 : 1)
}

// MARK: - main

if CommandLine.arguments.contains("--selftest") { runSelfTest() }
if CommandLine.arguments.contains("--radical-at") {
    // print the radical for given slots, to compare with Radicals.js
    let rs = loadRadicals()
    for a in CommandLine.arguments.drop(while: { $0 != "--radical-at" }).dropFirst() {
        if let slot = Int(a) { print(slot, rs[radicalIndex(count: rs.count, slot: slot)].radical) }
    }
    exit(0)
}
if CommandLine.arguments.contains("--login-status") {
    print("open at login:", SMAppService.mainApp.status == .enabled ? "enabled" : "status \(SMAppService.mainApp.status.rawValue)")
    exit(0)
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let controller = AppController()
app.delegate = controller
app.run()
