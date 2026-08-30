$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$base64 = [Console]::In.ReadToEnd()
$imageBytes = [Convert]::FromBase64String($base64)
$memoryStream = [System.IO.MemoryStream]::new($imageBytes)
$image = $null

try {
	$image = [System.Drawing.Image]::FromStream($memoryStream)

	$orientationPropertyId = 0x0112

	if ($image.PropertyIdList -contains $orientationPropertyId) {
		$orientation = $image.GetPropertyItem($orientationPropertyId).Value[0]

		switch ($orientation) {
			3 {
				$image.RotateFlip(
					[System.Drawing.RotateFlipType]::Rotate180FlipNone
				)
			}
			6 {
				$image.RotateFlip(
					[System.Drawing.RotateFlipType]::Rotate90FlipNone
				)
			}
			8 {
				$image.RotateFlip(
					[System.Drawing.RotateFlipType]::Rotate270FlipNone
				)
			}
		}
	}

	[System.Windows.Forms.Clipboard]::SetImage($image)
}
finally {
	if ($null -ne $image) {
		$image.Dispose()
	}

	$memoryStream.Dispose()
}