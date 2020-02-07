export class Animation {
  private elasped = 0;
  private frameTime = 0;
  private isPlaying = false;
  private currentFrame = 1;

  constructor(private quads: Quad[], fps: number, private loop = false) {
    this.frameTime = 1 / fps;
  }

  public update(dt: number) {
    if (this.frameTime > 0 && this.isPlaying) {
      this.elasped += dt;

      if (this.elasped >= this.frameTime) {
        this.elasped = 0;
        this.currentFrame += 1;

        if (this.currentFrame >= this.quads.length) {
          if (this.loop) {
            this.currentFrame = 0;
          } else {
            this.currentFrame = this.quads.length - 1;
            this.stop();
          }
        }
      }
    }
  }

  public getCurrentFrame(): Quad {
    return this.quads[this.currentFrame];
  }

  public play() {
    this.isPlaying = true;
  }

  public stop() {
    this.isPlaying = false;
  }

  public restart() {
    this.isPlaying = true;
    this.currentFrame = 0;
    this.elasped = 0;
  }
}
