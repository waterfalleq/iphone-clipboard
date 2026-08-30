param(
	[Parameter(Mandatory = $true)]
	[string]$ImagePath
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$resolvedPath = (Resolve-Path -LiteralPath $ImagePath).Path
$image = [System.Drawing.Image]::FromFile($resolvedPath)

try {
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
	$image.Dispose()
}