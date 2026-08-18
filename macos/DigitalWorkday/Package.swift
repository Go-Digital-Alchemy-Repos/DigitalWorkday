// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "DigitalWorkday",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "DigitalWorkday", targets: ["DigitalWorkday"]),
    ],
    dependencies: [
        .package(url: "https://github.com/socketio/socket.io-client-swift", .upToNextMinor(from: "16.1.1")),
        .package(url: "https://github.com/sparkle-project/Sparkle.git", exact: "2.9.4"),
    ],
    targets: [
        .executableTarget(
            name: "DigitalWorkday",
            dependencies: [
                .product(name: "SocketIO", package: "socket.io-client-swift"),
                .product(name: "Sparkle", package: "Sparkle"),
            ],
            path: "Sources/DigitalWorkday"
        ),
        .testTarget(
            name: "DigitalWorkdayTests",
            dependencies: ["DigitalWorkday"],
            path: "Tests/DigitalWorkdayTests"
        ),
    ]
)
