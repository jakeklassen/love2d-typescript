export class SpriteSheet {
  private readonly quads: Quad[][] = [];

  constructor(
    public readonly texture: Texture,
    frameWidth: number,
    frameHeight: number
  ) {
    const [width, height] = texture.getDimensions();
    const rows = height / frameHeight;
    const cols = width / frameWidth;

    if (Math.floor(cols) !== cols) {
      error("frame width must divide evenly into texture width");
    }

    if (Math.floor(rows) !== rows) {
      error("frame height must divide evenly into texture height");
    }

    for (let row = 0; row < rows; ++row) {
      this.quads[row] = [];

      for (let col = 0; col < cols; ++col) {
        this.quads[row][col] = love.graphics.newQuad(
          (col - 1) * frameWidth,
          (row - 1) * frameHeight,
          frameWidth,
          frameHeight,
          ...texture.getDimensions()
        );
      }
    }
  }

  public getFrame(row: number, col: number): Quad {
    if (this.quads[row][col] == null) {
      error(`frame at row(${row}) and col(${col}) not found`);
    }

    return this.quads[row][col];
  }
}
