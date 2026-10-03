// swift-tools-version:5.3

import PackageDescription

let package = Package(
    name: "capacitor-swift-pm",
    products: [
        .library(
            name: "Capacitor",
            targets: ["Capacitor"]
        ),
        .library(
            name: "Cordova",
            targets: ["Cordova"]
        )
    ],
    dependencies: [],
    targets: [
        .binaryTarget(
            name: "Capacitor",
            url: "https://github.com/ionic-team/capacitor-swift-pm/releases/download/8.5.0/Capacitor.xcframework.zip",
            checksum: "357220fe6dad73cb78bc1dc83e16e89d59c3d7dac8f9b17545a5be64bba25130"
        ),
        .binaryTarget(
            name: "Cordova",
            url: "https://github.com/ionic-team/capacitor-swift-pm/releases/download/8.5.0/Cordova.xcframework.zip",
            checksum: "a3dc72b5a559948d548f0ee2926b989492acc1023a0c86a1bf85477587f83a10"
        )
    ]
)
