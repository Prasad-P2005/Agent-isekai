import uvicorn

from . import config


def main() -> None:
    uvicorn.run("isekai.app:app", host=config.HOST, port=config.PORT, reload=False)


if __name__ == "__main__":
    main()
