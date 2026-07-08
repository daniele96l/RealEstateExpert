.PHONY: install test scrape

install:
	pip install -e ".[dev]"
	playwright install chromium

test:
	pytest -q

scrape:
	python -m reggio_rentals --pages 5
