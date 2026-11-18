import AppKit
import CoreText
import ImageIO
import UniformTypeIdentifiers

struct CompositionInput: Decodable {
    let photo: String
    let output: String
    let assets: String
    let text: String
    let height: Int
}

enum CompositionError: Error {
    case invalidPhoto, missingBrandAsset, invalidTypography, unreadableCopy, cannotWrite
}

func brandFont(_ name: String, at assets: URL) throws -> CGFont {
    let url = assets.appendingPathComponent("IBMPlexSansArabic-\(name).ttf")
    guard let provider = CGDataProvider(url: url as CFURL), let font = CGFont(provider) else {
        throw CompositionError.invalidTypography
    }
    return font
}

func copyFrame(_ text: String, width: CGFloat, maxHeight: CGFloat, topSize: CGFloat,
               medium: CGFont, regular: CGFont) -> (CTFrame, CGFloat)? {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .right
    paragraph.baseWritingDirection = .rightToLeft
    paragraph.lineBreakMode = .byWordWrapping
    paragraph.lineBreakStrategy = .pushOut
    paragraph.lineSpacing = topSize * 0.055
    paragraph.paragraphSpacing = topSize * 0.085
    let source = text as NSString
    let copy = NSMutableAttributedString(string: text, attributes: [
        .font: CTFontCreateWithGraphicsFont(regular, topSize * 0.76, nil, nil),
        .foregroundColor: NSColor.white, .paragraphStyle: paragraph
    ])
    let first = source.paragraphRange(for: NSRange(location: 0, length: 0))
    copy.addAttribute(.font, value: CTFontCreateWithGraphicsFont(medium, topSize, nil, nil), range: first)
    let setter = CTFramesetterCreateWithAttributedString(copy)
    let measured = CTFramesetterSuggestFrameSizeWithConstraints(setter, CFRangeMake(0, source.length), nil,
                                                                CGSize(width: width, height: .greatestFiniteMagnitude), nil)
    let height = ceil(measured.height) + 8
    guard height <= maxHeight else { return nil }
    let box = CGRect(x: 0, y: 0, width: width, height: height)
    let frame = CTFramesetterCreateFrame(setter, CFRangeMake(0, source.length), CGPath(rect: box, transform: nil), nil)
    let visible = CTFrameGetVisibleStringRange(frame)
    guard visible.location == 0 && visible.length == source.length else { return nil }
    return (frame, height)
}

func gradient(_ ctx: CGContext, color: [CGFloat], stops: [(CGFloat,CGFloat)], from: CGFloat, to: CGFloat) {
    let colors = stops.flatMap { [color[0], color[1], color[2], $0.1] }
    guard let gradient = CGGradient(colorSpace: CGColorSpaceCreateDeviceRGB(), colorComponents: colors,
                                    locations: stops.map(\.0), count: stops.count) else { return }
    ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: from), end: CGPoint(x: 0, y: to), options: [])
}

func compose(_ input: CompositionInput) throws {
    let source = URL(fileURLWithPath: input.photo) as CFURL
    guard let data = CGImageSourceCreateWithURL(source, nil),
          let photo = CGImageSourceCreateImageAtIndex(data, 0, nil) else { throw CompositionError.invalidPhoto }
    let assets = URL(fileURLWithPath: input.assets)
    guard let logo = NSImage(contentsOf: assets.appendingPathComponent("clinime-logo-white.svg")) else {
        throw CompositionError.missingBrandAsset
    }
    let medium = try brandFont("Medium", at: assets)
    let regular = try brandFont("Regular", at: assets)
    let w: CGFloat = 1080, h = CGFloat(input.height)
    let isStory = input.height == 1920
    let margin: CGFloat = 82, bottom: CGFloat = isStory ? 252 : 107
    let maxHeight = h * (isStory ? 0.51 : 0.53)
    var fit: (CTFrame, CGFloat)?
    for size in stride(from: isStory ? 65.0 : 61.0, through: 37.0, by: -2.0) {
        fit = copyFrame(input.text, width: w - margin * 2, maxHeight: maxHeight,
                        topSize: size, medium: medium, regular: regular)
        if fit != nil { break }
    }
    guard let (frame, copyHeight) = fit else { throw CompositionError.unreadableCopy }
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    guard let ctx = CGContext(data: nil, width: Int(w), height: Int(h), bitsPerComponent: 8,
                              bytesPerRow: 0, space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else {
        throw CompositionError.cannotWrite
    }
    let scale = max(w / CGFloat(photo.width), h / CGFloat(photo.height))
    let pw = CGFloat(photo.width) * scale, ph = CGFloat(photo.height) * scale
    ctx.interpolationQuality = .high
    ctx.draw(photo, in: CGRect(x: (w - pw) / 2, y: (h - ph) / 2, width: pw, height: ph))

    // The darkest portion sits behind the copy itself; the fade opens above it.
    let ink: [CGFloat] = [0.14, 0.095, 0.125]
    let topOfCopy = bottom + copyHeight
    let stop = min(h, topOfCopy + (isStory ? 360 : 260))
    gradient(ctx, color: ink, stops: [(0,0.90),(bottom/stop,0.86),(topOfCopy/stop,0.74),(1,0)],
             from: 0, to: stop)
    gradient(ctx, color: ink, stops: [(0,0.56),(0.47,0.50),(1,0)], from: h, to: h * 0.63)

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
    logo.draw(in: CGRect(x: margin - 6, y: h - (isStory ? 260 : 105) - 66, width: 264, height: 66),
              from: .zero, operation: .sourceOver, fraction: 1)
    NSGraphicsContext.restoreGraphicsState()

    ctx.saveGState()
    ctx.translateBy(x: margin, y: bottom)
    ctx.textMatrix = .identity
    CTFrameDraw(frame, ctx)
    ctx.restoreGState()
    guard let result = ctx.makeImage(),
          let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: input.output) as CFURL,
                                                            UTType.png.identifier as CFString, 1, nil) else {
        throw CompositionError.cannotWrite
    }
    CGImageDestinationAddImage(destination, result, nil)
    guard CGImageDestinationFinalize(destination) else { throw CompositionError.cannotWrite }
}

do {
    let input = try JSONDecoder().decode(CompositionInput.self, from: FileHandle.standardInput.readDataToEndOfFile())
    try compose(input)
} catch CompositionError.unreadableCopy {
    FileHandle.standardError.write(Data("TEXT_TOO_LONG".utf8))
    exit(2)
} catch {
    FileHandle.standardError.write(Data(String(describing: error).utf8))
    exit(1)
}
