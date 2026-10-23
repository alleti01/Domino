"""Domino data layer (Person 1): Zetaris USL lookups, test-world experiments, evidence logging.

Interface contract: contracts/README.md
"""

from .experiments import describe_world, list_worlds, run_experiment
from .lookups import dependency_path, lookup

__all__ = ["lookup", "dependency_path", "run_experiment", "describe_world", "list_worlds"]
