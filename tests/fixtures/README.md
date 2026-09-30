# Pleiades wire fixtures

These deterministic binary fixtures mirror the byte layout emitted by the
current Pleiades `ProtocolDataBundleBuilder` / object / zone writers on
`develop` commit `aac5de74c35560bf48c421aa8895c81a79e6479a`.

They intentionally cover data that is easy to regress in a JavaScript parser:
standalone point clouds, cluster + point-cloud packets, intensity arrays,
slider/XY values, zone point clouds, V3 UUIDs/readable IDs and timestamps.

The files are stored as hexadecimal text so they remain reviewable in Git.
Tests decode them to bytes before parsing. They are protocol-writer fixtures,
not a hardware/live-session capture.
